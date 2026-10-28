-- Catálogo de todo o mercado (B3 inteira + índices, ações dos EUA, moedas,
-- cripto e commodities) e a lista de acompanhamento de cada pessoa.
-- O coletor atualiza o catálogo uma vez por dia; os candles de um ativo são
-- buscados sob demanda pela função "historico" quando alguém abre o gráfico.

create table public.mercado_ativo (
  codigo        text primary key check (codigo ~ '^[A-Z0-9^=.\-]{1,16}$'),
  nome          text not null check (char_length(nome) between 1 and 200),
  tipo          text not null check (tipo in ('acao', 'fii', 'etf', 'fundo', 'bdr', 'indice', 'acao_exterior', 'moeda', 'cripto', 'commodity')),
  mercado       text not null check (mercado in ('B3', 'EUA', 'Global')),
  moeda         text not null default 'BRL' check (moeda in ('BRL', 'USD', 'EUR', 'JPY', 'GBP', 'HKD', 'PTS')),
  setor         text,
  logo_url      text check (logo_url is null or logo_url ~ '^https://'),
  preco         numeric(20, 6) check (preco is null or preco > 0),
  variacao      numeric(10, 4), -- % no dia
  volume        bigint check (volume is null or volume >= 0),
  valor_mercado numeric(22, 2) check (valor_mercado is null or valor_mercado >= 0),
  fonte         text not null,
  atualizado_em timestamptz not null default now()
);

create index mercado_ativo_tipo_volume on public.mercado_ativo (tipo, volume desc nulls last);
create index mercado_ativo_variacao on public.mercado_ativo (variacao desc nulls last);
create index mercado_ativo_nome on public.mercado_ativo (lower(nome) text_pattern_ops);

create table public.lista_acompanhamento (
  usuario_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  codigo     text not null check (codigo ~ '^[A-Z0-9^=.\-]{1,16}$'),
  ordem      integer not null default 0,
  criado_em  timestamptz not null default now(),
  primary key (usuario_id, codigo)
);

alter table public.mercado_ativo enable row level security;
alter table public.lista_acompanhamento enable row level security;

create policy "mercado_ativo: leitura" on public.mercado_ativo for select to authenticated using (true);

create policy "lista: ver a própria" on public.lista_acompanhamento for select to authenticated
  using ((select auth.uid()) = usuario_id);
create policy "lista: incluir na própria" on public.lista_acompanhamento for insert to authenticated
  with check ((select auth.uid()) = usuario_id);
create policy "lista: reordenar a própria" on public.lista_acompanhamento for update to authenticated
  using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "lista: tirar da própria" on public.lista_acompanhamento for delete to authenticated
  using ((select auth.uid()) = usuario_id);

grant select on public.mercado_ativo to authenticated;
grant select, insert, update, delete on public.lista_acompanhamento to authenticated;
revoke all on public.mercado_ativo, public.lista_acompanhamento from anon;
grant all on public.mercado_ativo, public.lista_acompanhamento to service_role;
