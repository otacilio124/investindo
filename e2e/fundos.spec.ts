import { expect, test } from '@playwright/test';
import { apagarConta, criarConta, entrar, type ContaTeste } from './apoio';

// Fundos do banco (como os do Itaú): tipo próprio, instituição e valor aplicado.
let conta: ContaTeste | undefined;
test.afterEach(async () => apagarConta(conta));

test('registra dois fundos do Itaú e mostra onde cada um está', async ({ page }) => {
  conta = await criarConta({ comPerfil: true });
  await entrar(page, conta);
  await page.goto('/carteira');

  const fundos = [
    { nome: 'Aplicação Privilege Int', classe: 'reserva', valor: '73' },
    { nome: 'Globdinfic Int', classe: 'renda_fixa', valor: '17' },
  ];
  for (const f of fundos) {
    await page.getByRole('button', { name: 'Registrar' }).first().click();
    const folha = page.getByRole('dialog');
    await folha.getByLabel('Investimento').selectOption('__novo__');
    await folha.getByLabel('Tipo', { exact: true }).selectOption('fundo');
    await expect(folha.getByLabel('Como rende')).toHaveCount(0);
    await expect(folha.getByLabel('Vencimento')).toHaveCount(0);
    await folha.getByLabel('Nome').fill(f.nome);
    await folha.getByLabel('Onde está (banco ou corretora)').fill('Itaú');
    await folha.getByLabel('Para que serve').selectOption(f.classe);
    await folha.getByLabel('Valor (R$)').fill(f.valor);
    await folha.getByRole('button', { name: 'Registrar' }).click();
    await expect(folha).toHaveCount(0);
  }

  // Cadastrar de novo com o mesmo nome soma ao mesmo fundo, em vez de dar erro.
  await page.getByRole('button', { name: 'Registrar' }).first().click();
  const folha = page.getByRole('dialog');
  await folha.getByLabel('Investimento').selectOption('__novo__');
  await folha.getByLabel('Tipo', { exact: true }).selectOption('fundo');
  await expect(folha.getByLabel(/Taxa|% do índice/)).toHaveCount(0);
  await folha.getByLabel('Nome').fill('Globdinfic Int');
  await folha.getByLabel('Onde está (banco ou corretora)').fill('Itaú');
  await folha.getByLabel('Para que serve').selectOption('renda_fixa');
  await folha.getByLabel('Valor (R$)').fill('10');
  await folha.getByRole('button', { name: 'Registrar' }).click();
  await expect(folha).toHaveCount(0);

  const investimentos = page.locator('section', { has: page.getByRole('heading', { name: 'Investimentos' }) });
  const privilege = investimentos.getByRole('row', { name: /Aplicação Privilege Int/ });
  await expect(privilege).toContainText('Reserva de emergência · Itaú');
  await expect(privilege).toContainText('R$ 73,00');
  const global = investimentos.getByRole('row', { name: /Globdinfic Int/ });
  await expect(global).toContainText('Renda fixa longa · Itaú');
  await expect(global).toContainText('R$ 27,00');
  await expect(investimentos.getByRole('row')).toHaveCount(3);
});
