import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurado = Boolean(url && chave);

export const supabase = createClient(url ?? 'http://127.0.0.1:54521', chave ?? 'sem-chave', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

/** Endereço base do app, usado nos links dos e-mails de conta. */
export const urlDoApp = (caminho: string) => `${window.location.origin}${caminho}`;

/** Mensagens de erro do Supabase Auth na voz da marca: nunca revelam se um e-mail existe. */
export function mensagemDeErro(e: unknown): string {
  const msg = (e as { message?: string; code?: string })?.message ?? '';
  const codigo = (e as { code?: string })?.code ?? '';
  if (/invalid login credentials/i.test(msg) || codigo === 'invalid_credentials') return 'E-mail ou senha não conferem.';
  if (/email not confirmed/i.test(msg) || codigo === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar. Procure o link na sua caixa de entrada.';
  if (/weak|password should/i.test(msg) || codigo === 'weak_password') return 'A senha precisa de pelo menos 8 caracteres, com letras e números.';
  if (/rate limit|too many|security purposes/i.test(msg) || codigo === 'over_email_send_rate_limit' || codigo === 'over_request_rate_limit') {
    return 'Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.';
  }
  if (/same.*password|different from the old/i.test(msg) || codigo === 'same_password') return 'A nova senha precisa ser diferente da atual.';
  if (/reauthentication|nonce/i.test(msg) || codigo === 'reauthentication_needed') return 'Por segurança, digite o código que enviamos para o seu e-mail.';
  if (/failed to fetch|network/i.test(msg)) return 'Sem conexão. Confira a internet e tente de novo.';
  return 'Algo deu errado. Tente de novo em instantes.';
}
