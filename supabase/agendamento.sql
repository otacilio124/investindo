-- Agendamento do coletor em produção.
-- Rodado por scripts/publicar-producao.ps1, que troca __PROJETO_URL__ e
-- __COLETOR_SEGREDO__ pelos valores reais num arquivo temporário (o segredo
-- nunca fica salvo no repositório). Pode rodar de novo sem duplicar nada.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Segredos no Vault: cria ou atualiza.
do $$
begin
  if exists (select 1 from vault.secrets where name = 'projeto_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'projeto_url'), '__PROJETO_URL__');
  else
    perform vault.create_secret('__PROJETO_URL__', 'projeto_url');
  end if;
  if exists (select 1 from vault.secrets where name = 'coletor_segredo') then
    perform vault.update_secret((select id from vault.secrets where name = 'coletor_segredo'), '__COLETOR_SEGREDO__');
  else
    perform vault.create_secret('__COLETOR_SEGREDO__', 'coletor_segredo');
  end if;
end $$;

create or replace function public.chamar_coletor(p_tarefa text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'projeto_url')
           || '/functions/v1/coletor?tarefa=' || p_tarefa,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'coletor_segredo')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$$;
revoke execute on function public.chamar_coletor(text) from public, anon, authenticated;

-- Horários em UTC (Brasília = UTC−3). cron.schedule com o mesmo nome substitui o agendamento.
-- Indicadores: 20h e, como redundância, de novo às 8h.
select cron.schedule('coletor-indicadores-noite', '0 23 * * *', $$ select public.chamar_coletor('indicadores') $$);
select cron.schedule('coletor-indicadores-manha', '0 11 * * *', $$ select public.chamar_coletor('indicadores') $$);
-- Tesouro Direto: o CSV oficial é atualizado no fim do dia útil.
select cron.schedule('coletor-tesouro', '30 23 * * 1-5', $$ select public.chamar_coletor('tesouro') $$);
select cron.schedule('coletor-tesouro-manha', '15 11 * * 2-6', $$ select public.chamar_coletor('tesouro') $$);
-- ETFs: a cada 30 min no pregão (10h–18h) e no fechamento.
select cron.schedule('coletor-cotacoes', '*/30 13-20 * * 1-5', $$ select public.chamar_coletor('cotacoes') $$);
select cron.schedule('coletor-cotacoes-fechamento', '30 21 * * 1-5', $$ select public.chamar_coletor('cotacoes') $$);
-- Candles (gráficos): junto com as cotações no pregão e no fechamento.
select cron.schedule('coletor-historico', '5,35 13-20 * * 1-5', $$ select public.chamar_coletor('historico') $$);
select cron.schedule('coletor-historico-fechamento', '40 21 * * 1-5', $$ select public.chamar_coletor('historico') $$);
-- Catálogo do mercado (B3 inteira + globais): no meio do pregão e depois do fechamento.
select cron.schedule('coletor-catalogo', '0 16 * * 1-5', $$ select public.chamar_coletor('catalogo') $$);
select cron.schedule('coletor-catalogo-fechamento', '50 21 * * 1-5', $$ select public.chamar_coletor('catalogo') $$);
-- Notícias: a cada 30 minutos, das 7h às 23h.
select cron.schedule('coletor-noticias', '10,40 10-23,0-2 * * *', $$ select public.chamar_coletor('noticias') $$);
-- Limpeza semanal do registro de execuções.
select cron.schedule('limpar-coleta-execucao', '0 6 * * 0',
  $$ delete from public.coleta_execucao where iniciado_em < now() - interval '60 days' $$);

-- Conferir:  select jobname, schedule from cron.job order by jobname;
-- Execuções: select tarefa, status, iniciado_em from public.coleta_execucao order by id desc limit 20;
