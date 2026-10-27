-- Permissões explícitas para a Data API.
-- O projeto em produção não expõe tabelas novas automaticamente, então cada
-- tabela recebe aqui só o que o app usa. O RLS continua decidindo QUAIS linhas
-- cada pessoa vê; isto aqui decide QUAIS operações existem.

grant usage on schema public to anon, authenticated, service_role;

-- Dados da pessoa (as políticas RLS limitam ao próprio usuario_id).
grant select, update on public.perfil to authenticated;
grant select, insert, update, delete on
  public.ativo,
  public.aporte,
  public.aporte_item,
  public.movimentacao,
  public.saldo_extrato,
  public.meta
to authenticated;

-- Dados públicos de mercado: só leitura para quem tem conta.
grant select on
  public.indicador,
  public.indicador_historico,
  public.preco_ativo,
  public.coleta_execucao,
  public.cotacao_diaria,
  public.noticia
to authenticated;

-- Quem não entrou na conta não acessa tabela nenhuma.
revoke all on all tables in schema public from anon;

-- Coletor e exclusão de conta (Edge Functions com a chave de serviço).
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- A função de confirmar aporte já tem grant próprio na migração inicial.
