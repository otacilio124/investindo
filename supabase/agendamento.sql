-- Agendamento do coletor (rodar UMA vez no SQL Editor do projeto, depois do deploy).
-- Não é migração porque depende da URL do projeto e de um segredo.
--
-- Antes, no painel: Database → Extensions → habilite pg_cron e pg_net.
-- Troque os dois valores abaixo e rode o arquivo inteiro.

select vault.create_secret('https://SEU-PROJETO.supabase.co', 'projeto_url');
select vault.create_secret('MESMO-VALOR-DO-COLETOR_SEGREDO', 'coletor_segredo');

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

-- Horários em UTC (Brasília = UTC−3).
-- Indicadores: 20h e, como redundância, de novo às 8h do dia seguinte.
select cron.schedule('coletor-indicadores-noite', '0 23 * * *', $$ select public.chamar_coletor('indicadores') $$);
select cron.schedule('coletor-indicadores-manha', '0 11 * * *', $$ select public.chamar_coletor('indicadores') $$);
-- Tesouro Direto: o CSV oficial é atualizado no fim do dia útil.
select cron.schedule('coletor-tesouro', '30 23 * * 1-5', $$ select public.chamar_coletor('tesouro') $$);
select cron.schedule('coletor-tesouro-manha', '15 11 * * 2-6', $$ select public.chamar_coletor('tesouro') $$);
-- ETFs: a cada 30 min no pregão (10h–18h), e um fechamento às 18h30.
select cron.schedule('coletor-cotacoes', '*/30 13-20 * * 1-5', $$ select public.chamar_coletor('cotacoes') $$);
select cron.schedule('coletor-cotacoes-fechamento', '30 21 * * 1-5', $$ select public.chamar_coletor('cotacoes') $$);
-- Candles (gráficos): junto com as cotações no pregão e no fechamento.
select cron.schedule('coletor-historico', '5,35 13-20 * * 1-5', $$ select public.chamar_coletor('historico') $$);
select cron.schedule('coletor-historico-fechamento', '40 21 * * 1-5', $$ select public.chamar_coletor('historico') $$);
-- Notícias: a cada 30 minutos, das 7h às 23h.
select cron.schedule('coletor-noticias', '10,40 10-23,0-2 * * *', $$ select public.chamar_coletor('noticias') $$);

-- Primeira carga, com 3 anos de histórico de CDI, Selic e IPCA (para a curva de CDB/Tesouro):
--   curl -X POST "https://SEU-PROJETO.supabase.co/functions/v1/coletor?tarefa=tudo&desde=2023-01-01" \
--        -H "Authorization: Bearer SEU_COLETOR_SEGREDO"
--
-- Conferir execuções:  select * from public.coleta_execucao order by id desc limit 20;
-- Ver agendamentos:    select * from cron.job;
-- Limpar o histórico de execuções antigas uma vez por semana:
select cron.schedule('limpar-coleta-execucao', '0 6 * * 0',
  $$ delete from public.coleta_execucao where iniciado_em < now() - interval '60 days' $$);
