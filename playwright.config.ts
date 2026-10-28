import { defineConfig } from '@playwright/test';

/**
 * Testes ponta a ponta contra o Supabase local (npx supabase start) e o app em
 * modo de desenvolvimento. Usam o Microsoft Edge já instalado no Windows, sem
 * baixar navegador. Cada teste cria a própria conta de teste e apaga no fim.
 *
 *   npm run e2e
 */
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/preparar.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    channel: process.env.E2E_NAVEGADOR ?? 'msedge',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
