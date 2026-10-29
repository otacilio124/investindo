-- Fundos de investimento (por exemplo, os fundos do banco onde a pessoa tem
-- conta). O valor de hoje vem do extrato, como nos CDBs sem taxa conhecida.
-- A instituição (banco ou corretora) já existia na coluna ativo.emissor.
alter type public.tipo_ativo add value if not exists 'fundo';
