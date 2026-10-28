-- Alertas (v2 do escopo): lembrete do dia do aporte, desvio de mais de 5 pontos
-- do alvo e vencimento de títulos. Saem por notificação no celular (Web Push)
-- e, para quem pedir, por e-mail. Quem envia é a função "alertas", uma vez por
-- dia, com a chave de serviço.

alter table public.perfil
  add column alerta_push  boolean not null default true,
  add column alerta_email boolean not null default false;

-- Cada aparelho em que a pessoa ligou as notificações.
create table public.inscricao_push (
  endpoint   text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  usuario_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  aparelho   text check (char_length(aparelho) <= 200),
  criado_em  timestamptz not null default now()
);

create index inscricao_push_usuario on public.inscricao_push (usuario_id);

-- O que já foi avisado, para não repetir: "aporte:2026-10",
-- "desvio:2026-10:acoes_br", "vencimento:<ativo>:2027-01-01".
create table public.alerta_enviado (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  chave      text not null check (char_length(chave) <= 120),
  titulo     text not null,
  corpo      text not null,
  canais     text[] not null default '{}',
  enviado_em timestamptz not null default now(),
  primary key (usuario_id, chave)
);

alter table public.inscricao_push enable row level security;
alter table public.alerta_enviado enable row level security;

create policy "push: ver as próprias" on public.inscricao_push for select to authenticated
  using ((select auth.uid()) = usuario_id);
create policy "push: incluir a própria" on public.inscricao_push for insert to authenticated
  with check ((select auth.uid()) = usuario_id);
create policy "push: atualizar a própria" on public.inscricao_push for update to authenticated
  using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "push: tirar a própria" on public.inscricao_push for delete to authenticated
  using ((select auth.uid()) = usuario_id);

create policy "alertas: ver os próprios" on public.alerta_enviado for select to authenticated
  using ((select auth.uid()) = usuario_id);

grant select, insert, update, delete on public.inscricao_push to authenticated;
grant select on public.alerta_enviado to authenticated;
revoke all on public.inscricao_push, public.alerta_enviado from anon;
grant all on public.inscricao_push, public.alerta_enviado to service_role;
