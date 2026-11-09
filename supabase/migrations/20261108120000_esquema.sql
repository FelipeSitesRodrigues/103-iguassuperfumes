-- ============================================================================
-- Iguassu de Parfum · esquema do catálogo
--
-- Projeto IGUASSU - CATALOGO (só da Iguassu), schema public.
-- 1. Tudo fechado por padrão: RLS em toda tabela, permissões devolvidas uma a
--    uma em 20261108120100_acesso.sql.
-- 2. Dinheiro em centavos. Quem edita é quem está em public.donos.
-- 3. O visitante nunca lê o banco: o build do site lê e gera páginas estáticas.
-- ============================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.definir_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

/* "Lattafa Asad 100 ml" vira "lattafa-asad-100-ml" (mesma regra do site/dados.mjs). */
create or replace function public.slug_de(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_texto, ''))), '&', ' e '),
    '[^a-z0-9]+', '-', 'g'));
$$;

-- ----------------------------------------------------------------------------
-- Quem pode editar
-- ----------------------------------------------------------------------------

create table public.donos (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 60),
  criado_em timestamptz not null default now()
);

create or replace function public.e_dono()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.donos d where d.user_id = (select auth.uid()));
$$;

-- ----------------------------------------------------------------------------
-- Catálogo
-- ----------------------------------------------------------------------------

create table public.marcas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (char_length(trim(nome)) between 1 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  criado_em timestamptz not null default now()
);

create sequence public.perfumes_codigo_seq start 1000;

create table public.perfumes (
  id uuid primary key default gen_random_uuid(),
  -- código curto que vai na sacola e no catálogo do site (os importados mantêm o da referência)
  codigo text not null unique default ('ig' || nextval('public.perfumes_codigo_seq')) check (codigo ~ '^[a-z0-9]{1,20}$'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 140),
  marca_id uuid not null references public.marcas (id) on delete restrict,
  nome text not null check (char_length(trim(nome)) between 1 and 120),
  linha text not null check (linha in ('arabe', 'importado')),
  volume text not null default '' check (char_length(volume) <= 20),
  descricao text not null default '' check (char_length(descricao) <= 4000),
  preco_centavos integer not null check (preco_centavos between 0 and 100000000),
  promo_centavos integer check (promo_centavos is null or (promo_centavos > 0 and promo_centavos < preco_centavos)),
  disponivel boolean not null default true,  -- false = esgotado (aparece com o selo)
  visivel boolean not null default true,     -- false = some do site
  destaque_ordem smallint check (destaque_ordem between 1 and 99), -- null = não é destaque
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index perfumes_marca_idx on public.perfumes (marca_id);

create table public.perfume_fotos (
  id uuid primary key default gen_random_uuid(),
  perfume_id uuid not null references public.perfumes (id) on delete cascade,
  ordem smallint not null default 0 check (ordem between 0 and 50),
  -- nome base no bucket "perfumes": p/<caminho>-400.webp e p/<caminho>-800.webp
  caminho text not null unique check (caminho ~ '^[a-z0-9-]{1,80}$'),
  criado_em timestamptz not null default now()
);
create index perfume_fotos_perfume_idx on public.perfume_fotos (perfume_id, ordem);

create table public.configuracoes (
  id boolean primary key default true check (id),
  whatsapp text not null default '5545988110629' check (whatsapp ~ '^55\d{10,11}$'),
  instagram text not null default '' check (char_length(instagram) <= 60),
  faixa_topo text not null default 'Pedido direto pelo WhatsApp, com atendimento de quem entende de perfume'
    check (char_length(faixa_topo) <= 120),
  -- banners trocados pelo painel (nome base no bucket, b/<nome>-<largura>.webp); vazio = o do site
  banner_desktop text not null default '' check (banner_desktop ~ '^[a-z0-9-]{0,80}$'),
  banner_mobile text not null default '' check (banner_mobile ~ '^[a-z0-9-]{0,80}$'),
  atualizado_em timestamptz not null default now()
);
insert into public.configuracoes (id) values (true);

create trigger perfumes_atualizado_em before update on public.perfumes
  for each row execute function public.definir_atualizado_em();
create trigger configuracoes_atualizado_em before update on public.configuracoes
  for each row execute function public.definir_atualizado_em();

-- ----------------------------------------------------------------------------
-- Fila de republicação do site (lida pelo 20261108120300_publicacao.sql)
-- ----------------------------------------------------------------------------

create table public.site_publicacao (
  id boolean primary key default true check (id),
  pendente boolean not null default false,
  pedido_em timestamptz,
  disparado_em timestamptz,
  pedido_net bigint,
  publicado_em timestamptz,
  status text not null default 'em_dia' check (status in (
    'em_dia', 'aguardando', 'publicando', 'falhou', 'sem_hook', 'teto_diario'
  )),
  erro text check (char_length(erro) <= 500),
  tentativas smallint not null default 0,
  disparos_hoje smallint not null default 0,
  dia_disparos date
);
insert into public.site_publicacao (id) values (true);

/* Qualquer mudança no catálogo marca o site pra republicar. */
create or replace function public.marcar_publicacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.site_publicacao
     set pendente = true,
         pedido_em = now(),
         status = case when status in ('publicando', 'teto_diario') then status else 'aguardando' end
   where id;
  return null;
end;
$$;
revoke all on function public.marcar_publicacao() from public, anon, authenticated;

create trigger marcas_publicar after insert or update or delete on public.marcas
  for each statement execute function public.marcar_publicacao();
create trigger perfumes_publicar after insert or update or delete on public.perfumes
  for each statement execute function public.marcar_publicacao();
create trigger perfume_fotos_publicar after insert or update or delete on public.perfume_fotos
  for each statement execute function public.marcar_publicacao();
create trigger configuracoes_publicar after update on public.configuracoes
  for each statement execute function public.marcar_publicacao();
