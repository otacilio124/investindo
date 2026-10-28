import { execSync } from 'node:child_process';

/** Lê URL e chaves do Supabase local (nunca do de produção) para os testes. */
export default function preparar() {
  const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(status.API_URL)) throw new Error('Os testes só rodam contra o Supabase local.');
  process.env.E2E_SUPABASE_URL = status.API_URL;
  process.env.E2E_ANON_KEY = status.ANON_KEY;
  process.env.E2E_SERVICE_KEY = status.SERVICE_ROLE_KEY;
}
