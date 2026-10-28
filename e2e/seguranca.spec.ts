import { expect, test } from '@playwright/test';
import { apagarConta, criarConta, entrar, proximoCodigo, type ContaTeste } from './apoio';

let conta: ContaTeste | undefined;
test.afterEach(async () => apagarConta(conta));

const secao = (page: import('@playwright/test').Page) =>
  page.locator('section', { has: page.getByRole('heading', { name: 'Segurança' }) });

test('verificação em duas etapas: ativa, exige o código e protege os dados no banco', async ({ page }) => {
  // Pode esperar até 30 s pelo próximo código do autenticador.
  test.setTimeout(120_000);
  conta = await criarConta({ comPerfil: true });
  await entrar(page, conta);
  await page.goto('/configuracoes');

  await secao(page).getByRole('button', { name: 'Ativar verificação em duas etapas' }).click();
  const segredo = (await secao(page).locator('code').textContent())!.trim();
  const primeiro = await proximoCodigo(segredo);
  await secao(page).getByLabel('2. Digite o código de 6 dígitos').fill(primeiro);
  await secao(page).getByRole('button', { name: 'Ativar', exact: true }).click();
  await expect(secao(page).getByText('Verificação em duas etapas ativada.')).toBeVisible();

  // Sai e entra de novo só com a senha: o app pede o código...
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await entrar(page, conta);
  await expect(page).toHaveURL(/\/verificar/);

  // ...e o banco não entrega o perfil para uma sessão sem o código (RLS).
  const linhas = await page.evaluate(async ([api, anon]) => {
    const chave = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))!;
    const token = JSON.parse(localStorage.getItem(chave)!).access_token;
    const r = await fetch(`${api}/rest/v1/perfil?select=nome`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    return (await r.json()).length;
  }, [process.env.E2E_SUPABASE_URL!, process.env.E2E_ANON_KEY!]);
  expect(linhas).toBe(0);

  await page.getByLabel('Código').fill('000000');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText(/Código errado ou vencido/)).toBeVisible();

  await page.getByLabel('Código').fill(await proximoCodigo(segredo, primeiro));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page).not.toHaveURL(/\/verificar/);
  await page.goto('/configuracoes');
  await expect(secao(page).getByText(/Ativada\. Ao entrar com a senha/)).toBeVisible();
});

test('passkey: cria em Ajustes e entra sem senha', async ({ page }) => {
  conta = await criarConta({ comPerfil: true });
  // Autenticador virtual do navegador, no lugar do Face ID / digital.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });

  await entrar(page, conta);
  await page.goto('/configuracoes');
  await secao(page).getByRole('button', { name: 'Criar passkey neste aparelho' }).click();
  await expect(secao(page).getByText(/Passkey criada/)).toBeVisible();
  await expect(secao(page).getByRole('button', { name: /^Apagar/ })).toHaveCount(1);

  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar/);
  await page.getByRole('button', { name: 'Entrar com passkey' }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
  await expect(page.getByRole('navigation').first()).toBeVisible();
});
