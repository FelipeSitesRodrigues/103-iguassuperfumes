-- ============================================================================
-- Iguassu de Parfum · republicação em lotes (2026-11-18)
--
-- Com 45 s de espera e 2 min entre disparos, cada perfume salvo virava um
-- deploy: no dia 17/11 o Eduardo editou 255 perfumes, bateu o teto de 60 e
-- acabou com a cota de deploys do plano Hobby da Vercel.
--
-- Agora:
--   10 min sem edição nova antes de publicar (junta a sessão de cadastro)
--   30 min no mínimo entre um disparo e outro
--   15 disparos por dia
--   botão "Publicar agora" no painel (publicar_agora): pula a espera, mas
--   respeita 2 min desde o último disparo e o teto do dia
-- ============================================================================

alter table public.site_publicacao add column if not exists forcar boolean not null default false;

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
           set status = 'falhou', pedido_net = null, forcar = false,
               erro = left(v_erro || ' Desisti depois de 3 tentativas.', 500)
         where id;
        return 'falhou';
      end if;
      -- nova tentativa sem esperar a janela de 10/30 min
      update public.site_publicacao
         set pendente = true, status = 'aguardando', pedido_net = null, forcar = true,
             erro = left(v_erro || ' Tentando de novo.', 500)
       where id;
      select * into v from public.site_publicacao where id;
    end if;
  end if;

  if not v.pendente then
    return 'nada';
  end if;
  if not v.forcar and v.pedido_em > now() - interval '10 minutes' then
    return 'juntando';
  end if;
  if v.disparado_em is not null
     and v.disparado_em > now() - (case when v.forcar then interval '2 minutes' else interval '30 minutes' end) then
    return 'espacando';
  end if;
  if v.disparos_hoje >= 15 then
    update public.site_publicacao
       set status = 'teto_diario', forcar = false,
           erro = 'Chegou ao limite de 15 publicações hoje. As mudanças entram depois da meia-noite.'
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
         forcar = false,
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

/* Botão "Publicar agora" do painel: só adianta o que já está na fila. */
create or replace function public.publicar_agora()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.site_publicacao;
begin
  if not public.e_dono() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into v from public.site_publicacao where id for update;
  if not v.pendente then
    return 'nada';
  end if;
  update public.site_publicacao set forcar = true where id;
  return 'na_fila';
end;
$$;

revoke all on function public.processar_publicacao() from public, anon, authenticated;
revoke all on function public.publicar_agora() from public, anon;
grant execute on function public.publicar_agora() to authenticated;
