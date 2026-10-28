import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { apagarConta, criarConta, entrar, type ContaTeste } from './apoio';

// Revisão automática de acessibilidade (axe-core, regras WCAG 2.1 A e AA) nas
// telas principais, nos dois temas. Falha com problemas sérios ou críticos.
const TELAS = ['/', '/investir', '/carteira', '/metas', '/mercado', '/configuracoes', '/impostos', '/aprender'];

async function revisar(page: Page, nome: string) {
  // Espera o conteúdo assentar (carregamento e animações de entrada).
  await expect(page.locator('.carregador')).toHaveCount(0);
  await page.waitForTimeout(800);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const graves = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of r.violations) {
    console.log(`[${nome}] ${v.impact} ${v.id}: ${v.help} (${v.nodes.length}x) → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    if (process.env.E2E_DETALHE) for (const n of v.nodes) console.log('   ', n.target.join(' '), JSON.stringify(n.any[0]?.data ?? n.failureSummary));
  }
  expect.soft(graves.map((v) => `${v.id} (${v.nodes.length}x)`), `problemas graves em ${nome}`).toEqual([]);
}

for (const tema of ['light', 'dark'] as const) {
  test.describe(`tema ${tema === 'light' ? 'claro' : 'escuro'}`, () => {
    // Sem animação: o axe mede o contraste das cores finais, não de um fade no meio.
    test.use({ colorScheme: tema, reducedMotion: 'reduce' });
    let conta: ContaTeste | undefined;
    test.afterAll(async () => apagarConta(conta));

    test('tela de entrada', async ({ page }) => {
      await page.goto('/entrar');
      await revisar(page, `entrar/${tema}`);
    });

    test('telas do app', async ({ page }) => {
      test.setTimeout(180_000);
      conta = await criarConta({ comPerfil: true });
      await entrar(page, conta);
      for (const tela of TELAS) {
        await page.goto(tela);
        await revisar(page, `${tela}/${tema}`);
      }
    });
  });
}
