// Gera os modelos de e-mail do Supabase Auth em supabase/templates/, com o
// layout do manual de marca. Rode: node scripts/gerar-emails.mjs
//
// Regras de e-mail (valem para Gmail, Outlook e Apple Mail):
// - tudo em tabelas e estilos inline; nada de flex, grid ou CSS externo;
// - largura máxima de 600 px, fontes seguras (Arial, Arial Black, Courier New);
// - botão "à prova de bala" (célula com cor de fundo + link), que funciona sem imagem;
// - texto de prévia escondido, que aparece ao lado do assunto na caixa de entrada.
//
// Os links usam token_hash e abrem /auth/confirmar no app, o que funciona mesmo
// se a pessoa abrir o e-mail num aparelho diferente do que usou no cadastro.
// Também grava supabase/templates/modelos.json, usado por enviar-modelos-email.mjs.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'templates');
mkdirSync(destino, { recursive: true });

const c = {
  fundo: '#F4F5F1', cartao: '#FFFFFF', linha: '#E3E8E4', tinta: '#0B1510', texto: '#33433A',
  suave: '#5C6B63', floresta: '#0A2E22', verde: '#0E7A4B', verdeSuave: '#E8F4EC',
  ouro: '#C9962B', ouroSuave: '#FBF3E0', alerta: '#B23A27', alertaSuave: '#FCEDEA',
};
const sans = `Arial,'Helvetica Neue',Helvetica,sans-serif`;
const display = `'Arial Black',Arial,sans-serif`;
const mono = `'Courier New',Courier,monospace`;

/* ------------------------------------------------------------------ */
/* Blocos                                                              */
/* ------------------------------------------------------------------ */

const paragrafo = (html, extra = '') =>
  `<p style="margin:0 0 16px;font-family:${sans};font-size:16px;line-height:26px;color:${c.texto};${extra}">${html}</p>`;

function botao(texto, link, cor = c.verde) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px">
  <tr><td align="center" bgcolor="${cor}" style="border-radius:6px;background:${cor}">
    <a href="${link}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${sans};font-size:16px;font-weight:bold;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:6px">${texto}&nbsp;&rarr;</a>
  </td></tr>
</table>`;
}

function caixa(conteudo, { fundo = c.fundo, borda = c.linha, faixa } = {}) {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
  <tr><td style="background:${fundo};border:1px solid ${borda};${faixa ? `border-left:4px solid ${faixa};` : ''}border-radius:6px;padding:16px 20px;font-family:${sans};font-size:14px;line-height:22px;color:${c.texto}">
    ${conteudo}
  </td></tr>
</table>`;
}

function proximosPassos(itens) {
  const linhas = itens.map((t, i) => `
    <tr>
      <td width="28" valign="top" style="padding:0 0 12px">
        <div style="width:22px;height:22px;border-radius:11px;background:${c.verde};color:#FFFFFF;font-family:${sans};font-size:12px;font-weight:bold;line-height:22px;text-align:center">${i + 1}</div>
      </td>
      <td valign="top" style="padding:1px 0 12px 8px;font-family:${sans};font-size:15px;line-height:22px;color:${c.texto}">${t}</td>
    </tr>`).join('');
  return `
<p style="margin:8px 0 12px;font-family:${sans};font-size:13px;font-weight:bold;letter-spacing:0.6px;text-transform:uppercase;color:${c.suave}">O que vem depois</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px">${linhas}</table>`;
}

const deParaEmail = (de, para) => caixa(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding:0 0 8px;font-family:${sans};font-size:12px;color:${c.suave};text-transform:uppercase;letter-spacing:0.6px">De</td>
    </tr>
    <tr><td style="padding:0 0 12px;font-family:${mono};font-size:15px;color:${c.suave};text-decoration:line-through">${de}</td></tr>
    <tr>
      <td style="padding:0 0 8px;font-family:${sans};font-size:12px;color:${c.suave};text-transform:uppercase;letter-spacing:0.6px">Para</td>
    </tr>
    <tr><td style="font-family:${mono};font-size:15px;font-weight:bold;color:${c.tinta}">${para}</td></tr>
  </table>`);

const linkReserva = (link) => `
<p style="margin:0 0 6px;font-family:${sans};font-size:13px;line-height:20px;color:${c.suave}">O botão não funcionou? Copie e cole este endereço no navegador:</p>
<p style="margin:0 0 24px;font-family:${mono};font-size:12px;line-height:18px;word-break:break-all"><a href="${link}" style="color:${c.verde};text-decoration:underline">${link}</a></p>`;

/* ------------------------------------------------------------------ */
/* Moldura                                                             */
/* ------------------------------------------------------------------ */

function layout({ previa, titulo, corpo, motivo }) {
  // Espaços invisíveis depois da prévia evitam que o cliente de e-mail complete com o texto do corpo.
  const enchimento = '&#847;&zwnj;&nbsp;'.repeat(40);
  return `<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${titulo}</title>
<style>
  @media (max-width:620px){ .conteudo{padding:28px 22px !important} .titulo{font-size:22px !important;line-height:28px !important} }
  a{color:${c.verde}}
</style>
</head>
<body style="margin:0;padding:0;background:${c.fundo};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${previa}${enchimento}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.fundo}">
<tr><td align="center" style="padding:32px 12px">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
    <!-- Marca -->
    <tr><td style="background:${c.floresta};border-radius:8px 8px 0 0;padding:22px 32px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:12px"><img src="{{ .SiteURL }}/marca/icone-192.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:4px"></td>
        <td style="font-family:${display};font-size:20px;font-weight:900;letter-spacing:1.5px;color:#FFFFFF">INVESTINDO<span style="color:${c.ouro}">!</span></td>
      </tr></table>
    </td></tr>
    <!-- Faixa de destaque -->
    <tr><td style="height:4px;line-height:4px;font-size:0;background:${c.verde}">&nbsp;</td></tr>
    <!-- Conteúdo -->
    <tr><td class="conteudo" style="background:${c.cartao};border:1px solid ${c.linha};border-top:0;border-radius:0 0 8px 8px;padding:40px 40px 16px">
      <h1 class="titulo" style="margin:0 0 20px;font-family:${display};font-size:26px;line-height:32px;font-weight:900;color:${c.tinta}">${titulo}</h1>
      ${corpo}
    </td></tr>
    <!-- Rodapé -->
    <tr><td style="padding:24px 32px 8px;text-align:center;font-family:${sans};font-size:12px;line-height:19px;color:${c.suave}">
      ${motivo}<br>
      <a href="{{ .SiteURL }}" style="color:${c.suave};text-decoration:underline">Abrir o Investindo!</a>
      &nbsp;·&nbsp;
      <a href="{{ .SiteURL }}/termos" style="color:${c.suave};text-decoration:underline">Termos e privacidade</a>
    </td></tr>
    <tr><td style="padding:4px 32px 0;text-align:center;font-family:${sans};font-size:11px;line-height:17px;color:#8A968F">
      Investindo! · Patrimônio se constrói todo mês.<br>
      Projeto acadêmico. Não é recomendação de investimento. Nunca pedimos senhas ou dados bancários por e-mail.
    </td></tr>
  </table>

</td></tr>
</table>
</body>
</html>
`;
}

const linkConfirmar = (tipo) => `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&amp;type=${tipo}`;
const motivoConta = 'Você recebeu este e-mail porque ele foi informado numa conta do Investindo!.';

/* ------------------------------------------------------------------ */
/* Modelos                                                             */
/* ------------------------------------------------------------------ */

const modelos = [
  {
    arquivo: 'confirmacao.html',
    chave: 'confirmation',
    assunto: 'Confirme seu e-mail para começar no Investindo!',
    html: layout({
      previa: 'Falta só um clique para ativar sua conta.',
      titulo: 'Confirme seu e-mail',
      motivo: 'Você recebeu este e-mail porque alguém criou uma conta no Investindo! com este endereço.',
      corpo: [
        paragrafo('Que bom ter você por aqui! Para ativar sua conta, confirme que <strong>{{ .Email }}</strong> é mesmo seu.'),
        botao('Confirmar meu e-mail', linkConfirmar('email')),
        proximosPassos([
          '<strong>Monte seu perfil</strong> em 2 minutos: quanto você gasta por mês e quanto risco aceita.',
          '<strong>Faça o curso rápido</strong>, feito para quem nunca investiu.',
          '<strong>Faça seu primeiro aporte</strong> com o passo a passo do app. Dá para começar com pouco.',
        ]),
        caixa(`O link vale por <strong>1 hora</strong> e só pode ser usado uma vez. Se você não criou uma conta, é só ignorar este e-mail: nada será ativado.`),
        linkReserva(linkConfirmar('email')),
      ].join(''),
    }),
  },
  {
    arquivo: 'redefinir-senha.html',
    chave: 'recovery',
    assunto: 'Redefina sua senha do Investindo!',
    html: layout({
      previa: 'Use o link para criar uma nova senha. Ele vale por 1 hora.',
      titulo: 'Vamos criar uma nova senha',
      motivo: motivoConta,
      corpo: [
        paragrafo('Recebemos um pedido para redefinir a senha da conta <strong>{{ .Email }}</strong>. Clique no botão para escolher uma nova.'),
        botao('Criar nova senha', linkConfirmar('recovery')),
        caixa(`<strong style="color:${c.tinta}">Não foi você?</strong><br>Ignore este e-mail. Sua senha atual continua valendo e ninguém consegue trocá-la sem este link.`,
          { fundo: c.ouroSuave, borda: '#EADBB4', faixa: c.ouro }),
        paragrafo('Por segurança, ao salvar a nova senha, todas as outras sessões abertas da sua conta são encerradas. O link vale por 1 hora.',
          `font-size:14px;line-height:22px;color:${c.suave}`),
        linkReserva(linkConfirmar('recovery')),
      ].join(''),
    }),
  },
  {
    arquivo: 'trocar-email.html',
    chave: 'email_change',
    assunto: 'Confirme a troca de e-mail no Investindo!',
    html: layout({
      previa: 'Confirme para concluir a troca do e-mail da sua conta.',
      titulo: 'Confirme a troca de e-mail',
      motivo: motivoConta,
      corpo: [
        paragrafo('Foi pedida a troca do e-mail de acesso da sua conta:'),
        deParaEmail('{{ .Email }}', '{{ .NewEmail }}'),
        botao('Confirmar a troca', linkConfirmar('email_change')),
        caixa(`Para sua segurança, enviamos um link para o endereço antigo e outro para o novo. <strong>A troca só vale depois da confirmação nos dois.</strong>`),
        caixa(`<strong style="color:${c.tinta}">Não pediu essa troca?</strong><br>Não clique no botão e troque sua senha agora mesmo pelo app.`,
          { fundo: c.alertaSuave, borda: '#F2CFC8', faixa: c.alerta }),
        linkReserva(linkConfirmar('email_change')),
      ].join(''),
    }),
  },
  {
    arquivo: 'reautenticacao.html',
    chave: 'reauthentication',
    assunto: 'Seu código de verificação do Investindo!',
    html: layout({
      previa: 'Use este código para confirmar a alteração na sua conta.',
      titulo: 'Seu código de verificação',
      motivo: motivoConta,
      corpo: [
        paragrafo('Digite este código no app para confirmar a alteração na sua conta:'),
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
          <tr><td align="center" style="background:${c.verdeSuave};border:1px dashed ${c.verde};border-radius:8px;padding:22px">
            <span style="font-family:${mono};font-size:34px;line-height:40px;font-weight:bold;letter-spacing:10px;color:${c.tinta}">{{ .Token }}</span>
          </td></tr>
        </table>`,
        paragrafo('O código vale por <strong>1 hora</strong>.', `font-size:14px;color:${c.suave}`),
        caixa(`<strong style="color:${c.tinta}">Nunca compartilhe este código.</strong> Ninguém do Investindo! vai pedi-lo por telefone, mensagem ou e-mail. Se você não pediu, ignore este e-mail.`,
          { fundo: c.ouroSuave, borda: '#EADBB4', faixa: c.ouro }),
      ].join(''),
    }),
  },
  {
    arquivo: 'aviso-senha-alterada.html',
    chave: 'password_changed_notification',
    assunto: 'Sua senha do Investindo! foi alterada',
    html: layout({
      previa: 'A senha da sua conta acabou de ser alterada.',
      titulo: 'Sua senha foi alterada',
      motivo: 'Este é um aviso automático de segurança da sua conta no Investindo!.',
      corpo: [
        paragrafo('A senha da conta <strong>{{ .Email }}</strong> acabou de ser alterada, e as outras sessões abertas foram encerradas.'),
        caixa(`<strong style="color:${c.verde}">&#10003; Foi você?</strong> Então está tudo certo, não precisa fazer nada.`,
          { fundo: c.verdeSuave, borda: '#CFE6D7', faixa: c.verde }),
        caixa(`<strong style="color:${c.alerta}">Não foi você?</strong> Alguém pode ter acessado sua conta. Peça agora um link para criar uma nova senha:`,
          { fundo: c.alertaSuave, borda: '#F2CFC8', faixa: c.alerta }),
        botao('Proteger minha conta', '{{ .SiteURL }}/esqueci-senha', c.alerta),
      ].join(''),
    }),
  },
  {
    arquivo: 'aviso-email-alterado.html',
    chave: 'email_changed_notification',
    assunto: 'O e-mail da sua conta Investindo! foi alterado',
    html: layout({
      previa: 'O e-mail de acesso da sua conta foi trocado.',
      titulo: 'O e-mail da sua conta mudou',
      motivo: 'Este é um aviso automático de segurança da sua conta no Investindo!.',
      corpo: [
        paragrafo('O e-mail de acesso da sua conta no Investindo! foi trocado:'),
        deParaEmail('{{ .OldEmail }}', '{{ .Email }}'),
        caixa(`<strong style="color:${c.verde}">&#10003; Foi você?</strong> Pronto: a partir de agora, entre com o e-mail novo.`,
          { fundo: c.verdeSuave, borda: '#CFE6D7', faixa: c.verde }),
        caixa(`<strong style="color:${c.alerta}">Não foi você?</strong> Responda a este e-mail o quanto antes para recuperarmos o acesso à sua conta.`,
          { fundo: c.alertaSuave, borda: '#F2CFC8', faixa: c.alerta }),
      ].join(''),
    }),
  },
];

for (const m of modelos) writeFileSync(join(destino, m.arquivo), m.html);
writeFileSync(
  join(destino, 'modelos.json'),
  JSON.stringify(modelos.map(({ arquivo, chave, assunto }) => ({ arquivo, chave, assunto })), null, 2) + '\n',
);
console.log(`${modelos.length} modelos gerados em ${destino}`);
