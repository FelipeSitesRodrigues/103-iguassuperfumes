-- ============================================================================
-- Iguassu de Parfum · republicação automática do site (copiada da 083)
--
-- 1. Os gatilhos marcam site_publicacao.pendente quando muda algo visível.
-- 2. O pg_cron roda processar_publicacao() a cada minuto. Com pendência, 45 s
--    sem mudança nova (junta várias edições num build só) e 2 min desde o
--    último disparo, chama o deploy hook da Vercel pelo pg_net.
-- 3. O site/build.mjs termina chamando registrar_publicacao(segredo), que grava
--    a hora em que o site novo foi pro ar. O painel mostra essa hora.
-- 4. Sem confirmação em 10 min, tenta de novo (até 3 vezes). Teto de 60
--    disparos por dia.
--
-- Segredos no Vault:
--   iguassu_deploy_hook   e   iguassu_publicacao_segredo
-- Enquanto não existirem, a fila fica em "sem_hook" e nada é chamado.
-- ============================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.processar_publicacao()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.site_publicacao;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_resposta record;
  v_hook text;
  v_pedido bigint;
  v_erro text;
begin
  select * into v from public.site_publicacao where id for update;

  if v.dia_disparos is distinct from v_hoje then
    update public.site_publicacao set disparos_hoje = 0, dia_disparos = v_hoje where id;
    v.disparos_hoje := 0;
  end if;

  if v.status = 'publicando' then
    v_erro := null;
    if v.pedido_net is not null then
      select r.status_code, r.timed_out, r.error_msg into v_resposta
        from net._http_response r
       where r.id = v.pedido_net;
      if found and (coalesce(v_resposta.timed_out, false) or v_resposta.error_msg is not null
                    or v_resposta.status_code is null or v_resposta.status_code not between 200 and 299) then
        v_erro := format('A Vercel recusou o pedido de publicação (%s).',
                         coalesce(v_resposta.status_code::text, v_resposta.error_msg, 'sem resposta'));
      end if;
    end if;
    if v_erro is null and v.disparado_em < now() - interval '10 minutes'
       and (v.publicado_em is null or v.publicado_em < v.disparado_em) then
      v_erro := 'O site não confirmou a publicação em 10 minutos.';
    end if;

    if v_erro is not null then
      if v.tentativas >= 3 then
        update public.site_publicacao
           set status = 'falhou', pedido_net = null,
               erro = left(v_erro || ' Desisti depois de 3 tentativas.', 500)
         where id;
        return 'falhou';
      end if;
      update public.site_publicacao
         set pendente = true, status = 'aguardando', pedido_net = null,
             pedido_em = least(coalesce(pedido_em, now()), now() - interval '1 minute'),
             erro = left(v_erro || ' Tentando de novo.', 500)
       where id;
      select * into v from public.site_publicacao where id;
    end if;
  end if;

  if not v.pendente then
    return 'nada';
  end if;
  if v.pedido_em > now() - interval '45 seconds' then
    return 'juntando';
  end if;
  if v.disparado_em is not null and v.disparado_em > now() - interval '2 minutes' then
    return 'espacando';
  end if;
  if v.disparos_hoje >= 60 then
    update public.site_publicacao
       set status = 'teto_diario', erro = 'Chegou ao limite de 60 publicações hoje. As mudanças entram amanhã.'
     where id;
    return 'teto_diario';
  end if;

  select ds.decrypted_secret into v_hook
    from vault.decrypted_secrets ds
   where ds.name = 'iguassu_deploy_hook';
  if v_hook is null or v_hook !~ '^https://api\.vercel\.com/' then
    update public.site_publicacao set status = 'sem_hook' where id and status <> 'sem_hook';
    return 'sem_hook';
  end if;

  v_pedido := net.http_post(url := v_hook, body := '{}'::jsonb, timeout_milliseconds := 15000);

  update public.site_publicacao
     set pendente = false,
         disparado_em = now(),
         pedido_net = v_pedido,
         status = 'publicando',
         tentativas = tentativas + 1,
         disparos_hoje = disparos_hoje + 1,
         dia_disparos = v_hoje
   where id;
  return 'disparado';
end;
$$;

/* Chamada pelo build do site no fim de cada build, com o segredo do Vault. */
create or replace function public.registrar_publicacao(p_segredo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_segredo text;
begin
  select ds.decrypted_secret into v_segredo
    from vault.decrypted_secrets ds
   where ds.name = 'iguassu_publicacao_segredo';
  if v_segredo is null or p_segredo is null or char_length(p_segredo) < 32
     or extensions.digest(p_segredo, 'sha256') <> extensions.digest(v_segredo, 'sha256') then
    return false;
  end if;

  update public.site_publicacao
     set publicado_em = now(),
         tentativas = 0,
         erro = null,
         pedido_net = null,
         status = case when pendente then 'aguardando' else 'em_dia' end
   where id;
  return true;
end;
$$;

revoke all on function public.processar_publicacao() from public, anon, authenticated;
revoke all on function public.registrar_publicacao(text) from public, anon, authenticated;
grant execute on function public.registrar_publicacao(text) to anon, service_role;

select cron.schedule('iguassu-publicar-site', '* * * * *', $$select public.processar_publicacao()$$);
