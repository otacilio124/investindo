// Gera os modelos de e-mail do Supabase Auth em supabase/templates/ com o layout
// do manual de marca ("E-mails da conta"). Rode: node scripts/gerar-emails.mjs
//
// Os links usam token_hash e abrem /auth/confirmar no app, o que funciona mesmo
// se a pessoa abrir o e-mail num aparelho diferente do que usou no cadastro.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'templates');
mkdirSync(destino, { recursive: true });

const cor = {
  superficie: '#F4F5F1', elevada: '#FFFFFF', linha: '#B9C4BC', tinta: '#0B1510',
  suave: '#45544C', floresta: '#0A2E22', verde: '#0E7A4B', ouro: '#C9962B',
};
const titulo = `font-family:'Arial Black',Arial,sans-serif;font-weight:900`;
const texto = `font-family:Arial,Helvetica,sans-serif`;

function layout({ previa, cabecalho, corpo, botao, link, rodape }) {
  const blocoBotao = botao
    ? `<tr><td style="padding:8px 0 24px">
        <a href="${link}" style="display:inline-block;background:${cor.verde};color:#FFFFFF;${texto};font-size:16px;font-weight:bold;line-height:48px;padding:0 24px;border-radius:4px;text-decoration:none">${botao}</a>
      </td></tr>
      <tr><td style="${texto};font-size:12px;line-height:16px;color:${cor.suave};padding-bottom:8px">Se o botão não abrir, copie este endereço no navegador:</td></tr>
      <tr><td style="${texto};font-size:12px;line-height:16px;color:${cor.verde};word-break:break-all;padding-bottom:16px">${link}</td></tr>`
    : '';
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Investindo!</title></head>
<body style="margin:0;padding:0;background:${cor.superficie}">
<span style="display:none;max-height:0;overflow:hidden">${previa}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${cor.superficie};padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${cor.elevada};border:1px solid ${cor.linha}">
    <tr><td style="background:${cor.floresta};padding:16px 24px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:12px"><img src="{{ .SiteURL }}/marca/icone-192.png" width="32" height="32" alt="" style="display:block;border:0"></td>
        <td style="${titulo};font-size:20px;letter-spacing:1px;color:#FFFFFF">INVESTINDO<span style="color:${cor.ouro}">!</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:32px 24px 8px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="${titulo};font-size:18px;line-height:24px;color:${cor.tinta};padding-bottom:16px">${cabecalho}</td></tr>
        <tr><td style="${texto};font-size:16px;line-height:24px;color:${cor.tinta};padding-bottom:16px">${corpo}</td></tr>
        ${blocoBotao}
        <tr><td style="${texto};font-size:12px;line-height:16px;color:${cor.suave};padding-bottom:24px">${rodape}</td></tr>
      </table>
    </td></tr>
  </table>
  <p style="${texto};font-size:12px;line-height:16px;color:${cor.suave};margin:16px 0 0">Investindo! · Patrimônio se constrói todo mês.<br>Projeto acadêmico. Não é recomendação de investimento.</p>
</td></tr>
</table>
</body>
</html>
`;
}

const linkConfirmar = (tipo) => `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&amp;type=${tipo}`;

const modelos = {
  'confirmacao.html': layout({
    previa: 'Confirme seu e-mail para começar.',
    cabecalho: 'Confirme seu e-mail',
    corpo: 'Falta um passo para criar sua conta no Investindo!. Confirme que este e-mail é seu e você entra direto no questionário de perfil.',
    botao: 'Confirmar meu e-mail',
    link: linkConfirmar('email'),
    rodape: 'Este link vale por 1 hora. Se você não criou uma conta, ignore este e-mail.',
  }),
  'redefinir-senha.html': layout({
    previa: 'Crie uma nova senha para sua conta.',
    cabecalho: 'Redefina sua senha',
    corpo: 'Recebemos um pedido para criar uma nova senha para {{ .Email }}. Ao salvar a nova senha, as outras sessões abertas são encerradas.',
    botao: 'Criar nova senha',
    link: linkConfirmar('recovery'),
    rodape: 'Este link vale por 1 hora. Se você não pediu, ignore este e-mail: sua senha continua a mesma.',
  }),
  'trocar-email.html': layout({
    previa: 'Confirme a troca de e-mail da sua conta.',
    cabecalho: 'Confirme a troca de e-mail',
    corpo: 'Foi pedida a troca do e-mail da sua conta de {{ .Email }} para {{ .NewEmail }}. A troca só vale depois da confirmação nos dois endereços.',
    botao: 'Confirmar a troca',
    link: linkConfirmar('email_change'),
    rodape: 'Este link vale por 1 hora. Se você não pediu essa troca, ignore este e-mail e troque sua senha.',
  }),
  'reautenticacao.html': layout({
    previa: 'Seu código de confirmação.',
    cabecalho: 'Seu código de confirmação',
    corpo: `Use este código para confirmar a alteração na sua conta:<br><br><span style="font-family:'Courier New',monospace;font-size:32px;line-height:36px;font-weight:bold;letter-spacing:4px">{{ .Token }}</span>`,
    rodape: 'O código vale por 1 hora. Se você não pediu, ignore este e-mail.',
  }),
  'aviso-senha-alterada.html': layout({
    previa: 'A senha da sua conta foi alterada.',
    cabecalho: 'Sua senha foi alterada',
    corpo: 'A senha da conta {{ .Email }} no Investindo! acabou de ser alterada, e as outras sessões foram encerradas.',
    rodape: 'Foi você? Então está tudo certo. Se não foi, peça um novo link em "Esqueci minha senha" agora mesmo.',
  }),
  'aviso-email-alterado.html': layout({
    previa: 'O e-mail da sua conta foi alterado.',
    cabecalho: 'O e-mail da sua conta mudou',
    corpo: 'O e-mail da sua conta no Investindo! foi trocado de {{ .OldEmail }} para {{ .Email }}.',
    rodape: 'Se você não fez essa troca, responda ao suporte do projeto o quanto antes.',
  }),
};

for (const [nome, html] of Object.entries(modelos)) writeFileSync(join(destino, nome), html);
console.log(`${Object.keys(modelos).length} modelos gerados em ${destino}`);
