-- Dados de demonstração SÓ para o ambiente local: 12 meses de aportes passados na
-- conta de teste, usando os preços históricos reais já coletados (cotacao_diaria)
-- e o CDI do Banco Central. Serve para ver os gráficos de evolução preenchidos.
--
--   docker exec -i supabase_db_Investindo psql -U postgres -d postgres < scripts/demo-local.sql
--
-- Pode rodar de novo: apaga e recria só o que tem observacao = 'demo'.

do $$
declare
  u uuid;
  bova uuid;
  ivvb uuid;
  cdb uuid;
  inicio date;
  d date;
  px numeric;
begin
  select id into u from auth.users where email = 'teste@investindo.test';
  if u is null then
    raise exception 'Crie antes a conta teste@investindo.test pelo app.';
  end if;

  delete from public.movimentacao where usuario_id = u and observacao = 'demo';

  select id into bova from public.ativo where codigo = 'BOVA11' and usuario_id is null;
  select id into ivvb from public.ativo where codigo = 'IVVB11' and usuario_id is null;
  select id into cdb from public.ativo where usuario_id = u and codigo = 'DEMO-CDB-102';
  if cdb is null then
    insert into public.ativo (usuario_id, codigo, nome, classe, tipo, indexador, emissor)
    values (u, 'DEMO-CDB-102', 'CDB Banco Demo 102% CDI', 'renda_fixa', 'cdb', 'cdi', 'Banco Demo')
    returning id into cdb;
  end if;

  for i in reverse 12..1 loop
    inicio := (date_trunc('month', current_date) - make_interval(months => i))::date + 4;

    select data, fechamento into d, px from public.cotacao_diaria
     where codigo = 'BOVA11' and data >= inicio order by data limit 1;
    if d is null then continue; end if;

    insert into public.movimentacao (usuario_id, ativo_id, tipo, data, quantidade, preco_unitario, observacao)
    values (u, bova, 'compra', d, 1, px, 'demo');

    if i % 2 = 0 then
      select fechamento into px from public.cotacao_diaria where codigo = 'IVVB11' and data = d;
      if px is not null then
        insert into public.movimentacao (usuario_id, ativo_id, tipo, data, quantidade, preco_unitario, observacao)
        values (u, ivvb, 'compra', d, 1, px, 'demo');
      end if;
    end if;

    insert into public.movimentacao (usuario_id, ativo_id, tipo, data, quantidade, preco_unitario, taxa_contratada, observacao)
    values (u, cdb, 'compra', d, 1, 300, 102, 'demo');
  end loop;

  raise notice 'Demo criada: % movimentações', (select count(*) from public.movimentacao where usuario_id = u and observacao = 'demo');
end $$;
