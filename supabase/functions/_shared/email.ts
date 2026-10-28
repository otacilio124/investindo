// E-mails mandados pelas funções (exclusão de conta e alertas), com o mesmo
// layout dos modelos do Supabase Auth (scripts/gerar-emails.mjs): tabelas,
// estilos inline e o logotipo em PNG, que todo cliente de e-mail mostra.

const c = { fundo: '#F4F5F1', linha: '#E3E8E4', tinta: '#0B1510', texto: '#33433A', suave: '#5C6B63', floresta: '#0A2E22', verde: '#0E7A4B' };
const sans = `Arial,'Helvetica Neue',Helvetica,sans-serif`;
const display = `'Arial Black',Arial,sans-serif`;

export const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export const urlDoApp = () => (Deno.env.get('APP_URL') ?? 'https://investindo.vercel.app').replace(/\/$/, '');

/** Parágrafos já escapados por quem chama; `botao` leva para uma tela do app. */
export function layoutEmail({ titulo, paragrafos, botao, rodape }: {
  titulo: string;
  paragrafos: string[];
  botao?: { texto: string; url: string };
  rodape?: string;
}): string {
  const app = urlDoApp();
  const corpo = paragrafos
    .map((p) => `<p style="margin:0 0 16px;font-family:${sans};font-size:16px;line-height:26px;color:${c.texto}">${p}</p>`)
    .join('');
  const chamada = botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td align="center" bgcolor="${c.verde}" style="border-radius:6px;background:${c.verde}">
<a href="${app}${botao.url}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${sans};font-size:16px;font-weight:bold;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:6px">${escapar(botao.texto)}&nbsp;&rarr;</a></td></tr></table>`
    : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapar(titulo)}</title></head>
<body style="margin:0;padding:0;background:${c.fundo}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.fundo}"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td style="background:${c.floresta};border-radius:8px 8px 0 0;padding:22px 32px">
<img src="${app}/marca/investindo-logotipo-email.png" width="240" height="32" alt="Investindo!" style="display:block;border:0;font-family:${display};font-size:20px;line-height:32px;color:#FFFFFF">
</td></tr>
<tr><td style="height:4px;line-height:4px;font-size:0;background:${c.verde}">&nbsp;</td></tr>
<tr><td style="background:#FFFFFF;border:1px solid ${c.linha};border-top:0;border-radius:0 0 8px 8px;padding:40px 40px 24px">
<h1 style="margin:0 0 20px;font-family:${display};font-size:24px;line-height:30px;font-weight:900;color:${c.tinta}">${escapar(titulo)}</h1>
${corpo}${chamada}
<p style="margin:16px 0 0;font-family:${sans};font-size:12px;line-height:18px;color:${c.suave}">${rodape ?? 'Investindo! é um projeto acadêmico. Não é recomendação de investimento.'}</p>
</td></tr></table></td></tr></table></body></html>`;
}

/** Envia pelo Resend. Devolve false (sem lançar) se não houver chave ou o envio falhar. */
export async function enviarEmail(para: string, assunto: string, html: string): Promise<boolean> {
  const chave = Deno.env.get('RESEND_API_KEY');
  if (!chave) return false;
  const remetente = Deno.env.get('EMAIL_REMETENTE') ?? 'Investindo! <nao-responda@seudominio>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: remetente, to: [para], subject: assunto, html }),
    });
    if (!r.ok) console.error('e-mail não enviado', r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error('e-mail não enviado', (e as Error).message);
    return false;
  }
}
