-- Progresso do curso para iniciantes, guardado no perfil para valer em qualquer aparelho.

alter table public.perfil
  add column tutorial_visto_em timestamptz,
  add column licoes_concluidas text[] not null default '{}'
    check (cardinality(licoes_concluidas) <= 50);
