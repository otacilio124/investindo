// Tira as capturas de tela do README (docs/telas/) com o app local e a conta
// de teste do ambiente local (a de scripts/demo-local.sql). O nome da pessoa é
// trocado só na resposta que chega ao navegador, para as imagens não mostrarem
// nome real. Precisa de "npx supabase start" e "npm run dev" rodando.
//
//   CAPTURA_EMAIL=... CAPTURA_SENHA=... node scripts/capturar-telas.mjs

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.CAPTURA_URL ?? 'http://localhost:5173';
const email = process.env.CAPTURA_EMAIL;
const senha = process.env.CAPTURA_SENHA;
if (!email || !senha) throw new Error('Defina CAPTURA_EMAIL e CAPTURA_SENHA (conta de teste local).');
const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'telas');
mkdirSync(destino, { recursive: true });

const navegador = await chromium.launch({ channel: 'msedge' });

async function sessao({ largura, altura, tema }) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: altura }, colorScheme: tema, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.route('**/rest/v1/perfil*', async (rota) => {
    if (rota.request().method() !== 'GET') return rota.continue();
    const r = await rota.fetch();
    const corpo = await r.json();
    const trocar = (p) => ({ ...p, nome: 'Marina' });
    await rota.fulfill({ response: r, json: Array.isArray(corpo) ? corpo.map(trocar) : trocar(corpo) });
  });
  return { ctx, page };
}

async function entrar(page) {
  await page.goto(`${base}/entrar`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));
}

async function foto(page, nome, caminho, antes) {
  if (caminho) await page.goto(`${base}${caminho}`);
  await page.locator('#abertura').waitFor({ state: 'detached' }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('.carregador, .esqueleto'), null, { timeout: 20_000 }).catch(() => {});
  if (antes) await antes(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(destino, `${nome}.jpg`), type: 'jpeg', quality: 82 });
  console.log(`docs/telas/${nome}.jpg`);
}

// Computador, tema claro.
{
  const { ctx, page } = await sessao({ largura: 1440, altura: 900, tema: 'light' });
  await foto(page, 'entrar', '/entrar');
  await entrar(page);
  await foto(page, 'inicio', '/');
  await foto(page, 'investir', '/investir', (p) => p.getByLabel('Valor do aporte em reais').fill('700'));
  await foto(page, 'carteira', '/carteira');
  await ctx.close();
}
// Computador, tema escuro.
{
  const { ctx, page } = await sessao({ largura: 1440, altura: 900, tema: 'dark' });
  await entrar(page);
  await foto(page, 'mercado-escuro', '/mercado');
  await ctx.close();
}
// Celular.
{
  const { ctx, page } = await sessao({ largura: 390, altura: 844, tema: 'light' });
  await entrar(page);
  await foto(page, 'celular-inicio', '/');
  await foto(page, 'celular-carteira', '/carteira');
  await ctx.close();
}
await navegador.close();
