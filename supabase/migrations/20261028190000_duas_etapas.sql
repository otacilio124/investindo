-- Verificação em duas etapas (fase 3 do escopo).
-- Quem ativou um app autenticador só lê e grava os próprios dados depois de
-- digitar o código (sessão "aal2"). A regra fica no banco, e não só na tela:
-- uma sessão aberta só com a senha não chega à carteira nem pela API.

create function public.segunda_etapa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

revoke execute on function public.segunda_etapa_ok() from public, anon;
grant execute on function public.segunda_etapa_ok() to authenticated;

-- Políticas restritivas: somam-se às existentes (as duas precisam passar).
do $$
declare
  t text;
begin
  foreach t in array array[
    'perfil', 'ativo', 'aporte', 'aporte_item', 'movimentacao', 'saldo_extrato',
    'meta', 'lista_acompanhamento', 'inscricao_push', 'alerta_enviado'
  ] loop
    execute format(
      'create policy "duas etapas: exige o código" on public.%I as restrictive for all to authenticated
         using ((select public.segunda_etapa_ok())) with check ((select public.segunda_etapa_ok()))',
      t
    );
  end loop;
end $$;
