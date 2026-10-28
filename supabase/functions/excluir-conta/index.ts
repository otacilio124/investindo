// Exclui a conta da pessoa logada e todos os dados dela (LGPD).
// O app confirma a senha antes de chamar (signInWithPassword); aqui conferimos
// a sessão, apagamos o usuário (as tabelas caem em cascata) e mandamos o aviso
// de exclusão pelo Resend.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { enviarEmail, escapar, layoutEmail } from '../_shared/email.ts';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function emailExclusao(nome: string): string {
  const saudacao = nome ? `Olá, ${escapar(nome)}.` : 'Olá.';
  return layoutEmail({
    titulo: 'Sua conta foi excluída',
    paragrafos: [`${saudacao} Apagamos seu perfil, sua carteira, seus aportes e suas metas do Investindo!, como você pediu.`],
    rodape: 'Se você não pediu isso, responda ao suporte do projeto o quanto antes.',
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ erro: 'método não permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: quem, error: erroSessao } = await admin.auth.getUser(jwt);
  if (erroSessao || !quem.user) return resposta({ erro: 'sessão inválida' }, 401);
  const usuario = quem.user;

  const { data: perfil } = await admin.from('perfil').select('nome').eq('usuario_id', usuario.id).maybeSingle();
  const { error } = await admin.auth.admin.deleteUser(usuario.id);
  if (error) return resposta({ erro: 'não foi possível excluir a conta agora' }, 500);

  // O aviso é um extra: se o envio falhar, a exclusão já está feita.
  if (usuario.email) await enviarEmail(usuario.email, 'Sua conta do Investindo! foi excluída', emailExclusao(perfil?.nome ?? ''));
  return resposta({ ok: true });
});
