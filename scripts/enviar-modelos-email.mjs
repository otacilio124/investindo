// Envia os modelos de e-mail (assunto + HTML) para o Supabase de produção pela
// Management API, sem copiar e colar no painel.
//
// Uso (PowerShell), com um token pessoal criado em
// https://supabase.com/dashboard/account/tokens (não cole o token no chat):
//
//   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
//   node scripts/enviar-modelos-email.mjs --simular   # mostra o que mudaria
//   node scripts/enviar-modelos-email.mjs             # envia
//
// Só altera campos de e-mail que já existem na configuração do projeto; nada
// mais é tocado (SMTP, senhas, URLs ficam como estão).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pasta = join(raiz, 'supabase', 'templates');
const simular = process.argv.includes('--simular');
const token = process.env.SUPABASE_ACCESS_TOKEN;

function refDoProjeto() {
  const arg = process.argv.find((a) => a.startsWith('--ref='));
  if (arg) return arg.slice(6);
  try {
    return readFileSync(join(raiz, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  } catch {
    return null;
  }
}

const ref = refDoProjeto();
if (!token) {
  console.error('Defina SUPABASE_ACCESS_TOKEN (crie em https://supabase.com/dashboard/account/tokens).');
  process.exit(1);
}
if (!ref) {
  console.error('Não achei o projeto. Rode "npx supabase link" antes ou passe --ref=SEU_PROJECT_REF.');
  process.exit(1);
}

const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const cabecalhos = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const atual = await fetch(api, { headers: cabecalhos });
if (!atual.ok) {
  console.error(`Não consegui ler a configuração (${atual.status}): ${await atual.text()}`);
  process.exit(1);
}
const config = await atual.json();

const modelos = JSON.parse(readFileSync(join(pasta, 'modelos.json'), 'utf8'));
const mudancas = {};
const ignorados = [];

for (const m of modelos) {
  const html = readFileSync(join(pasta, m.arquivo), 'utf8');
  const campos = {
    [`mailer_subjects_${m.chave}`]: m.assunto,
    [`mailer_templates_${m.chave}_content`]: html,
  };
  // Avisos de segurança (senha/e-mail alterados) precisam ser ligados.
  if (m.chave.endsWith('_notification')) {
    campos[`mailer_notifications_${m.chave.replace(/_notification$/, '')}_enabled`] = true;
  }
  for (const [campo, valor] of Object.entries(campos)) {
    if (!(campo in config)) ignorados.push(campo);
    else if (config[campo] !== valor) mudancas[campo] = valor;
  }
}

console.log(`Projeto: ${ref}`);
console.log(`Campos a atualizar: ${Object.keys(mudancas).length}`);
for (const campo of Object.keys(mudancas)) console.log(`  • ${campo}`);
if (ignorados.length) {
  console.log('Campos que este projeto não tem (ignorados):');
  for (const campo of ignorados) console.log(`  - ${campo}`);
}
if (simular || Object.keys(mudancas).length === 0) {
  console.log(simular ? '\nSimulação: nada foi enviado.' : '\nNada a mudar.');
  process.exit(0);
}

const resposta = await fetch(api, { method: 'PATCH', headers: cabecalhos, body: JSON.stringify(mudancas) });
if (!resposta.ok) {
  console.error(`Falhou (${resposta.status}): ${await resposta.text()}`);
  process.exit(1);
}
console.log('\nModelos enviados. Faça um teste: crie uma conta ou peça "Esqueci minha senha".');
