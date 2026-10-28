import { expect, test } from '@playwright/test';
import { apagarConta, criarConta, entrar, type ContaTeste } from './apoio';

// O fluxo principal do escopo: primeiro acesso, digitar o valor, ver o rateio,
// marcar como comprado e ver a carteira atualizada.
let conta: ContaTeste | undefined;
test.afterEach(async () => apagarConta(conta));

test('primeiro acesso, aporte do mês e carteira', async ({ page }) => {
  conta = await criarConta();
  await entrar(page, conta);

  await expect(page).toHaveURL(/\/primeiro-acesso/);
  await page.getByLabel('Quanto você gasta por mês? (R$)').fill('2.000,00');
  await page.getByRole('button', { name: 'Começar a investir' }).click();
  await expect(page).not.toHaveURL(/\/primeiro-acesso/);

  // Apresentação para quem acabou de chegar: aparece uma vez só.
  const boasVindas = page.getByRole('dialog');
  await expect(boasVindas.getByRole('heading', { name: 'Bem-vindo ao Investindo!' })).toBeVisible();
  const gravou = page.waitForResponse((r) => r.url().includes('/rest/v1/perfil') && r.request().method() === 'PATCH');
  await boasVindas.getByRole('button', { name: 'Pular' }).click();
  await gravou;
  await expect(boasVindas).toHaveCount(0);

  await page.goto('/investir');
  await page.getByLabel('Valor do aporte em reais').fill('700');
  // Reserva vazia: o aporte inteiro vai para ela, com o produto da reserva.
  await expect(page.getByRole('heading', { name: /Plano para R\$\s?700,00/ })).toBeVisible();
  await page.getByRole('button', { name: /Vou comprar assim/ }).click();

  await page.getByRole('button', { name: 'Confirmar compras' }).click();
  await expect(page.getByText('Pronto! Aporte registrado e carteira atualizada.')).toBeVisible();

  await page.goto('/carteira');
  const investimentos = page.locator('section', { has: page.getByRole('heading', { name: 'Investimentos' }) });
  await expect(investimentos.getByRole('row')).toHaveCount(2); // cabeçalho + 1 investimento
  await expect(page.getByRole('heading', { name: 'Aportes por mês' })).toBeVisible();
  await expect(page.getByText('Aportes em 1 dos últimos 12 meses.')).toBeVisible();
});
