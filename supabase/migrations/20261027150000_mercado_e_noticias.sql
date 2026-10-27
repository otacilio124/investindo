-- Histórico de candles (OHLC) para os gráficos de mercado e notícias de economia.
-- Dados públicos: o app só lê; quem escreve é o coletor, com a chave de serviço.

create table public.cotacao_diaria (
  codigo     text not null,
  data       date not null,
  abertura   numeric(18, 6) not null check (abertura > 0),
  maxima     numeric(18, 6) not null check (maxima > 0),
  minima     numeric(18, 6) not null check (minima > 0),
  fechamento numeric(18, 6) not null check (fechamento > 0),
  volume     bigint not null default 0 check (volume >= 0),
  fonte      text not null,
  atualizado_em timestamptz not null default now(),
  primary key (codigo, data),
  constraint cotacao_diaria_coerente check (maxima >= minima)
);

create index cotacao_diaria_recente on public.cotacao_diaria (codigo, data desc);

create table public.noticia (
  id           bigint generated always as identity primary key,
  url          text not null unique check (url ~ '^https://'),
  titulo       text not null check (char_length(titulo) between 1 and 300),
  resumo       text check (char_length(resumo) <= 400),
  imagem_url   text check (imagem_url is null or imagem_url ~ '^https://'),
  fonte        text not null,
  publicado_em timestamptz not null,
  coletado_em  timestamptz not null default now()
);

create index noticia_recente on public.noticia (publicado_em desc);

alter table public.cotacao_diaria enable row level security;
alter table public.noticia enable row level security;

create policy "cotacao_diaria: leitura" on public.cotacao_diaria for select to authenticated using (true);
create policy "noticia: leitura" on public.noticia for select to authenticated using (true);

revoke all on public.cotacao_diaria, public.noticia from anon;
