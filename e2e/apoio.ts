import { createHmac, randomBytes } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

const url = () => process.env.E2E_SUPABASE_URL!;
const admin = (caminho: string, init: RequestInit = {}) =>
  fetch(`${url()}${caminho}`, {
    ...init,
    headers: { apikey: process.env.E2E_SERVICE_KEY!, Authorization: `Bearer ${process.env.E2E_SERVICE_KEY}`, 'Content-Type': 'application/json', ...init.headers },
  });

export interface ContaTeste {
  id: string;
  email: string;
  senha: string;
  nome: string;
}

/** Conta nova, já confirmada, só no Supabase local. */
export async function criarConta({ comPerfil = false } = {}): Promise<ContaTeste> {
  const sufixo = randomBytes(4).toString('hex');
  const conta = { email: `e2e-${sufixo}@investindo.test`, senha: `Teste${sufixo}9`, nome: 'Pessoa de Teste' };
  const r = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: conta.email, password: conta.senha, email_confirm: true, user_metadata: { nome: conta.nome, aceite_termos: true } }),
  });
  if (!r.ok) throw new Error(`não criou a conta de teste: ${r.status} ${await r.text()}`);
  const { id } = await r.json();
  if (comPerfil) {
    const p = await admin(`/rest/v1/perfil?usuario_id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ onboarding_concluido: true, gasto_mensal: 3000, tutorial_visto_em: new Date().toISOString() }),
    });
    if (!p.ok) throw new Error(`não preparou o perfil: ${p.status}`);
  }
  return { id, ...conta };
}

export async function apagarConta(conta?: ContaTeste) {
  if (conta) await admin(`/auth/v1/admin/users/${conta.id}`, { method: 'DELETE' });
}

export async function entrar(page: Page, conta: ContaTeste) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(conta.email);
  await page.getByLabel('Senha', { exact: true }).fill(conta.senha);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
}

/** Código TOTP (RFC 6238) de 6 dígitos, como o app autenticador mostraria. */
export function codigoTotp(segredoBase32: string, quando = Date.now()): string {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of segredoBase32.replace(/=+$/, '').toUpperCase()) bits += alfabeto.indexOf(c).toString(2).padStart(5, '0');
  const chave = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(quando / 30_000)));
  const h = createHmac('sha1', chave).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Espera o próximo período de 30 s, para não repetir um código já usado. */
export async function proximoCodigo(segredo: string, usado?: string): Promise<string> {
  let c = codigoTotp(segredo);
  while (c === usado) {
    await new Promise((ok) => setTimeout(ok, 1000));
    c = codigoTotp(segredo);
  }
  return c;
}
