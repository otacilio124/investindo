// Exclui a conta da pessoa logada e todos os dados dela (LGPD).
// O app confirma a senha antes de chamar (signInWithPassword); aqui conferimos
// a sessão, apagamos o usuário (as tabelas caem em cascata) e mandamos o aviso
// de exclusão pelo Resend.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function emailExclusao(nome: string): string {
  const saudacao = nome ? `Olá, ${escapar(nome)}.` : 'Olá.';
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F4F5F1;font-family:Arial,sans-serif;color:#0B1510">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F1;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border:1px solid #B9C4BC">
<tr><td style="background:#0A2E22;padding:20px 24px;font-family:'Arial Black',Arial,sans-serif;font-size:20px;color:#FFFFFF;letter-spacing:1px">INVESTINDO<span style="color:#C9962B">!</span></td></tr>
<tr><td style="padding:32px 24px">
<h1 style="margin:0 0 16px;font-family:'Arial Black',Arial,sans-serif;font-size:18px;line-height:24px">Sua conta foi excluída</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:24px">${saudacao} Apagamos seu perfil, sua carteira, seus aportes e suas metas do Investindo!, como você pediu.</p>
<p style="margin:0;font-size:12px;line-height:16px;color:#45544C">Se você não pediu isso, responda ao suporte do projeto o quanto antes.</p>
</td></tr></table></td></tr></table></body></html>`;
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
  const chave = Deno.env.get('RESEND_API_KEY');
  const remetente = Deno.env.get('EMAIL_REMETENTE') ?? 'Investindo! <nao-responda@seudominio>';
  if (chave && usuario.email) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: remetente,
          to: [usuario.email],
          subject: 'Sua conta do Investindo! foi excluída',
          html: emailExclusao(perfil?.nome ?? ''),
        }),
      });
    } catch (e) {
      console.error('aviso de exclusão não enviado', (e as Error).message);
    }
  }
  return resposta({ ok: true });
});
