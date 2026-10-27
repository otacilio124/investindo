-- Investindo! — esquema inicial
-- Dinheiro em numeric(14,2) (nunca float). Dados de cada pessoa ligados por
-- usuario_id e protegidos por Row Level Security. Dados públicos de mercado
-- (indicadores, preços, catálogo) são só leitura para o app; quem escreve é o
-- coletor, com a chave de serviço.

-- =====================================================================
-- Tipos
-- =====================================================================
create type public.tipo_perfil as enum ('conservador', 'moderado', 'arrojado');
create type public.classe_ativo as enum ('reserva', 'renda_fixa', 'acoes_br', 'exterior');
create type public.tipo_ativo as enum ('etf', 'tesouro', 'cdb', 'lci_lca', 'outro');
create type public.indexador as enum ('pre', 'cdi', 'selic', 'ipca', 'nenhum');
create type public.tipo_movimentacao as enum ('compra', 'venda');
create type public.status_aporte as enum ('sugerido', 'confirmado', 'cancelado');
create type public.tipo_meta as enum ('patrimonio', 'personalizada');
create type public.status_dado as enum ('ok', 'desatualizado', 'falhou');

create function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- =====================================================================
-- Perfil (1 por conta)
-- =====================================================================
create table public.perfil (
  usuario_id           uuid primary key references auth.users (id) on delete cascade,
  nome                 text not null default '' check (char_length(nome) <= 120),
  tipo_perfil          public.tipo_perfil not null default 'moderado',
  gasto_mensal         numeric(14, 2) not null default 0 check (gasto_mensal >= 0),
  meses_reserva        smallint not null default 6 check (meses_reserva between 3 and 12),
  dia_aporte           smallint not null default 5 check (dia_aporte between 1 and 28),
  prazo_anos           smallint not null default 10 check (prazo_anos between 1 and 50),
  pct_renda_fixa       numeric(5, 2) not null default 50,
  pct_acoes_br         numeric(5, 2) not null default 25,
  pct_exterior         numeric(5, 2) not null default 25,
  etf_acoes_br         text not null default 'BOVA11' check (etf_acoes_br ~ '^[A-Z]{4}[0-9]{1,2}$'),
  etf_exterior         text not null default 'IVVB11' check (etf_exterior ~ '^[A-Z]{4}[0-9]{1,2}$'),
  produto_reserva      text not null default 'Tesouro Selic',
  -- CDB prefixado de referência: taxas de CDB não têm API pública, a pessoa digita.
  cdb_pre_nome         text check (char_length(cdb_pre_nome) <= 80),
  cdb_pre_taxa         numeric(6, 3) check (cdb_pre_taxa is null or cdb_pre_taxa between 0 and 100),
  -- Valor que não atingiu o mínimo do produto e soma ao próximo aporte.
  caixa_pendente       numeric(14, 2) not null default 0 check (caixa_pendente >= 0),
  onboarding_concluido boolean not null default false,
  aceite_termos_em     timestamptz,
  revisado_em          date,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  constraint perfil_pct_positivos check (pct_renda_fixa >= 0 and pct_acoes_br >= 0 and pct_exterior >= 0),
  constraint perfil_pct_soma_100 check (pct_renda_fixa + pct_acoes_br + pct_exterior = 100)
);

create trigger perfil_atualizado_em before update on public.perfil
  for each row execute function public.tocar_atualizado_em();

-- Cria o perfil assim que a conta nasce no Supabase Auth.
create function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfil (usuario_id, nome, aceite_termos_em)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'nome', ''), 120),
    case when (new.raw_user_meta_data ->> 'aceite_termos') = 'true' then now() end
  );
  return new;
end;
$$;

create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- =====================================================================
-- Ativos: catálogo público (usuario_id nulo) + ativos próprios (CDBs etc.)
-- =====================================================================
create table public.ativo (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid references auth.users (id) on delete cascade,
  codigo           text not null check (char_length(codigo) between 1 and 60),
  nome             text not null check (char_length(nome) between 1 and 120),
  classe           public.classe_ativo not null,
  tipo             public.tipo_ativo not null,
  indexador        public.indexador not null default 'nenhum',
  vencimento       date,
  isento_ir        boolean not null default false,
  liquidez_diaria  boolean not null default false,
  emissor          text check (char_length(emissor) <= 120),
  disponivel       boolean not null default true,
  criado_em        timestamptz not null default now()
);

create unique index ativo_catalogo_codigo on public.ativo (codigo) where usuario_id is null;
create unique index ativo_usuario_codigo on public.ativo (usuario_id, codigo) where usuario_id is not null;
create index ativo_usuario on public.ativo (usuario_id);

-- =====================================================================
-- Dados públicos de mercado (escritos só pelo coletor)
-- =====================================================================
create table public.indicador (
  codigo          text primary key,
  nome            text not null,
  valor           numeric(18, 6) not null,
  unidade         text not null,
  data_referencia date not null,
  fonte           text not null,
  fonte_url       text,
  status          public.status_dado not null default 'ok',
  atualizado_em   timestamptz not null default now(),
  -- Última tentativa de coleta, com ou sem sucesso.
  verificado_em   timestamptz not null default now()
);

create table public.indicador_historico (
  codigo          text not null,
  data_referencia date not null,
  valor           numeric(18, 8) not null,
  fonte           text not null,
  primary key (codigo, data_referencia)
);

-- Preço diário de ETFs (fechamento/último) e títulos do Tesouro (PU de resgate).
create table public.preco_ativo (
  codigo        text not null,
  data          date not null,
  preco         numeric(18, 6) not null check (preco > 0),
  preco_compra  numeric(18, 6),
  taxa_compra   numeric(8, 4),
  taxa_venda    numeric(8, 4),
  fonte         text not null,
  atualizado_em timestamptz not null default now(),
  primary key (codigo, data)
);

create index preco_ativo_recente on public.preco_ativo (codigo, data desc);

create table public.coleta_execucao (
  id            bigint generated always as identity primary key,
  tarefa        text not null,
  iniciado_em   timestamptz not null default now(),
  finalizado_em timestamptz,
  status        text not null default 'rodando' check (status in ('rodando', 'ok', 'parcial', 'falhou')),
  detalhes      jsonb not null default '[]'::jsonb
);

-- =====================================================================
-- Aportes (o rateio sugerido e o que foi confirmado)
-- =====================================================================
create table public.aporte (
  id                  uuid primary key default gen_random_uuid(),
  usuario_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  competencia         date not null check (extract(day from competencia) = 1),
  data                date not null default current_date,
  valor_informado     numeric(14, 2) not null check (valor_informado > 0),
  caixa_anterior      numeric(14, 2) not null default 0 check (caixa_anterior >= 0),
  caixa_pendente_novo numeric(14, 2) not null default 0 check (caixa_pendente_novo >= 0),
  status              public.status_aporte not null default 'sugerido',
  -- Foto de tudo que o cálculo usou (percentuais, saldos, indicadores, preços,
  -- passos): permite responder depois "por que o app sugeriu isso?".
  regras              jsonb not null default '{}'::jsonb,
  criado_em           timestamptz not null default now(),
  confirmado_em       timestamptz
);

create index aporte_usuario_data on public.aporte (usuario_id, data desc);

create table public.aporte_item (
  id                  uuid primary key default gen_random_uuid(),
  aporte_id           uuid not null references public.aporte (id) on delete cascade,
  usuario_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  classe              public.classe_ativo not null,
  ativo_id            uuid references public.ativo (id) on delete set null,
  produto             text not null,
  valor_sugerido      numeric(14, 2) not null check (valor_sugerido >= 0),
  quantidade_sugerida numeric(18, 8),
  preco_referencia    numeric(18, 6),
  motivo              text
);

create index aporte_item_aporte on public.aporte_item (aporte_id);
create index aporte_item_usuario on public.aporte_item (usuario_id);

-- =====================================================================
-- Movimentações (compras e vendas/resgates registrados à mão)
-- =====================================================================
create table public.movimentacao (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ativo_id         uuid not null references public.ativo (id) on delete restrict,
  aporte_id        uuid references public.aporte (id) on delete set null,
  tipo             public.tipo_movimentacao not null default 'compra',
  data             date not null,
  -- ETF: cotas; Tesouro: frações do título; CDB/LCI: 1 com o valor no preço.
  quantidade       numeric(18, 8) not null check (quantidade > 0),
  preco_unitario   numeric(18, 6) not null check (preco_unitario >= 0),
  valor_total      numeric(14, 2) generated always as (round(quantidade * preco_unitario, 2)) stored,
  -- pre/ipca: % a.a.; cdi/selic: % do índice. Necessária para calcular a curva.
  taxa_contratada  numeric(8, 4) check (taxa_contratada is null or taxa_contratada between -10 and 300),
  custos           numeric(14, 2) not null default 0 check (custos >= 0),
  observacao       text check (char_length(observacao) <= 500),
  criado_em        timestamptz not null default now()
);

create index movimentacao_usuario_data on public.movimentacao (usuario_id, data);
create index movimentacao_ativo on public.movimentacao (ativo_id);
create index movimentacao_aporte on public.movimentacao (aporte_id);

-- Saldo copiado do extrato do banco: a forma mais fiel de acompanhar CDB e afins.
create table public.saldo_extrato (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ativo_id    uuid not null references public.ativo (id) on delete cascade,
  data        date not null,
  valor_bruto numeric(14, 2) not null check (valor_bruto >= 0),
  criado_em   timestamptz not null default now(),
  unique (ativo_id, usuario_id, data)
);

create index saldo_extrato_usuario on public.saldo_extrato (usuario_id);

-- =====================================================================
-- Metas (a reserva de emergência é calculada a partir do perfil)
-- =====================================================================
create table public.meta (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo          public.tipo_meta not null default 'personalizada',
  nome          text not null check (char_length(nome) between 1 and 80),
  valor_alvo    numeric(14, 2) not null check (valor_alvo > 0),
  prazo         date,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index meta_usuario on public.meta (usuario_id);
create trigger meta_atualizado_em before update on public.meta
  for each row execute function public.tocar_atualizado_em();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.perfil              enable row level security;
alter table public.ativo               enable row level security;
alter table public.indicador           enable row level security;
alter table public.indicador_historico enable row level security;
alter table public.preco_ativo         enable row level security;
alter table public.coleta_execucao     enable row level security;
alter table public.aporte              enable row level security;
alter table public.aporte_item         enable row level security;
alter table public.movimentacao        enable row level security;
alter table public.saldo_extrato       enable row level security;
alter table public.meta                enable row level security;

-- Perfil: só o dono lê e altera; criado pelo gatilho, apagado com a conta.
create policy "perfil: dono lê" on public.perfil
  for select to authenticated using (usuario_id = (select auth.uid()));
create policy "perfil: dono altera" on public.perfil
  for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

-- Ativos: todos leem o catálogo; cada um gerencia os próprios.
create policy "ativo: lê catálogo e os próprios" on public.ativo
  for select to authenticated using (usuario_id is null or usuario_id = (select auth.uid()));
create policy "ativo: cria os próprios" on public.ativo
  for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy "ativo: altera os próprios" on public.ativo
  for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));
create policy "ativo: apaga os próprios" on public.ativo
  for delete to authenticated using (usuario_id = (select auth.uid()));

-- Dados públicos: leitura para quem tem conta; escrita só pela chave de serviço (sem política).
create policy "indicador: leitura" on public.indicador for select to authenticated using (true);
create policy "indicador_historico: leitura" on public.indicador_historico for select to authenticated using (true);
create policy "preco_ativo: leitura" on public.preco_ativo for select to authenticated using (true);
create policy "coleta_execucao: leitura" on public.coleta_execucao for select to authenticated using (true);

-- Tabelas da pessoa: dono faz tudo, e só referencia ativos/aportes visíveis para ele.
create policy "aporte: dono" on public.aporte
  for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

create policy "aporte_item: dono" on public.aporte_item
  for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (
    usuario_id = (select auth.uid())
    and exists (select 1 from public.aporte a where a.id = aporte_id and a.usuario_id = (select auth.uid()))
  );

create policy "movimentacao: dono" on public.movimentacao
  for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (
    usuario_id = (select auth.uid())
    and exists (
      select 1 from public.ativo t
      where t.id = ativo_id and (t.usuario_id is null or t.usuario_id = (select auth.uid()))
    )
    and (aporte_id is null or exists (
      select 1 from public.aporte a where a.id = aporte_id and a.usuario_id = (select auth.uid())
    ))
  );

create policy "saldo_extrato: dono" on public.saldo_extrato
  for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (
    usuario_id = (select auth.uid())
    and exists (
      select 1 from public.ativo t
      where t.id = ativo_id and (t.usuario_id is null or t.usuario_id = (select auth.uid()))
    )
  );

create policy "meta: dono" on public.meta
  for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

-- Ninguém sem conta toca em nada.
revoke all on all tables in schema public from anon;

-- =====================================================================
-- Confirmar aporte: grava as compras, fecha o aporte e atualiza o caixa
-- numa única transação. Roda com as permissões de quem chama (RLS vale).
-- =====================================================================
create function public.confirmar_aporte(p_aporte_id uuid, p_compras jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_aporte public.aporte;
  v_compra jsonb;
begin
  select * into v_aporte from public.aporte
   where id = p_aporte_id and usuario_id = auth.uid()
   for update;
  if not found then
    raise exception 'Aporte não encontrado.' using errcode = 'P0002';
  end if;
  if v_aporte.status <> 'sugerido' then
    raise exception 'Este aporte já foi %.', v_aporte.status using errcode = 'P0001';
  end if;

  for v_compra in select * from jsonb_array_elements(p_compras) loop
    insert into public.movimentacao (ativo_id, aporte_id, tipo, data, quantidade, preco_unitario, taxa_contratada)
    values (
      (v_compra ->> 'ativo_id')::uuid,
      p_aporte_id,
      'compra',
      coalesce((v_compra ->> 'data')::date, current_date),
      (v_compra ->> 'quantidade')::numeric,
      (v_compra ->> 'preco_unitario')::numeric,
      nullif(v_compra ->> 'taxa_contratada', '')::numeric
    );
  end loop;

  update public.aporte
     set status = 'confirmado', confirmado_em = now()
   where id = p_aporte_id;

  update public.perfil
     set caixa_pendente = v_aporte.caixa_pendente_novo
   where usuario_id = auth.uid();
end;
$$;

revoke execute on function public.confirmar_aporte(uuid, jsonb) from anon, public;
grant execute on function public.confirmar_aporte(uuid, jsonb) to authenticated;

-- =====================================================================
-- Catálogo inicial de ETFs (Tesouro é preenchido pelo coletor)
-- =====================================================================
insert into public.ativo (codigo, nome, classe, tipo, indexador, emissor) values
  ('BOVA11', 'iShares Ibovespa (BOVA11)', 'acoes_br', 'etf', 'nenhum', 'BlackRock'),
  ('BOVV11', 'It Now Ibovespa (BOVV11)', 'acoes_br', 'etf', 'nenhum', 'Itaú Asset'),
  ('IVVB11', 'iShares S&P 500 em reais (IVVB11)', 'exterior', 'etf', 'nenhum', 'BlackRock'),
  ('SPXI11', 'It Now S&P 500 em reais (SPXI11)', 'exterior', 'etf', 'nenhum', 'Itaú Asset'),
  ('WRLD11', 'Investo Mundo em reais (WRLD11)', 'exterior', 'etf', 'nenhum', 'Investo');
