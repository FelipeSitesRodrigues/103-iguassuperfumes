-- ============================================================================
-- Iguassu de Parfum · quem lê e quem escreve
--
-- Projeto novo do Supabase não dá permissão de tabela pra ninguém (nem pro
-- service_role): tudo é concedido aqui, e o RLS filtra por linha.
--   anon           (build do site, chave pública)  lê o catálogo visível
--   authenticated  (painel)                        lê tudo e edita, se for dono
--   service_role   (scripts de carga)              tudo
-- ============================================================================

alter table public.donos enable row level security;
alter table public.marcas enable row level security;
alter table public.perfumes enable row level security;
alter table public.perfume_fotos enable row level security;
alter table public.configuracoes enable row level security;
alter table public.site_publicacao enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- leitura do catálogo
grant select on public.marcas, public.perfumes, public.perfume_fotos, public.configuracoes to anon, authenticated;

create policy marcas_ler on public.marcas for select to anon, authenticated using (true);
create policy perfumes_ler on public.perfumes for select to anon, authenticated
  using (visivel or (select public.e_dono()));
create policy fotos_ler on public.perfume_fotos for select to anon, authenticated using (true);
create policy configuracoes_ler on public.configuracoes for select to anon, authenticated using (true);

-- escrita do dono
grant insert, update, delete on public.marcas, public.perfumes, public.perfume_fotos to authenticated;
grant update (whatsapp, instagram, faixa_topo, banner_desktop, banner_mobile) on public.configuracoes to authenticated;
grant usage on sequence public.perfumes_codigo_seq to authenticated;

create policy marcas_dono_inserir on public.marcas for insert to authenticated with check ((select public.e_dono()));
create policy marcas_dono_mudar on public.marcas for update to authenticated using ((select public.e_dono())) with check ((select public.e_dono()));
create policy marcas_dono_apagar on public.marcas for delete to authenticated using ((select public.e_dono()));

create policy perfumes_dono_inserir on public.perfumes for insert to authenticated with check ((select public.e_dono()));
create policy perfumes_dono_mudar on public.perfumes for update to authenticated using ((select public.e_dono())) with check ((select public.e_dono()));
create policy perfumes_dono_apagar on public.perfumes for delete to authenticated using ((select public.e_dono()));

create policy fotos_dono_inserir on public.perfume_fotos for insert to authenticated with check ((select public.e_dono()));
create policy fotos_dono_mudar on public.perfume_fotos for update to authenticated using ((select public.e_dono())) with check ((select public.e_dono()));
create policy fotos_dono_apagar on public.perfume_fotos for delete to authenticated using ((select public.e_dono()));

create policy configuracoes_dono_mudar on public.configuracoes for update to authenticated
  using ((select public.e_dono())) with check ((select public.e_dono()));

-- o painel mostra se o site está em dia; o dono vê o próprio registro
grant select on public.site_publicacao to authenticated;
create policy publicacao_dono_ler on public.site_publicacao for select to authenticated using ((select public.e_dono()));
grant select on public.donos to authenticated;
create policy donos_ler_proprio on public.donos for select to authenticated using (user_id = (select auth.uid()));

revoke all on function public.e_dono() from public;
grant execute on function public.e_dono() to anon, authenticated, service_role;
grant execute on function public.slug_de(text) to anon, authenticated, service_role;

-- tabela nova criada depois disto não abre sozinha pra ninguém
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
