import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

interface ContextoSessao {
  sessao: Session | null;
  carregando: boolean;
  /** true quando a pessoa chegou pelo link de redefinição de senha. */
  recuperandoSenha: boolean;
  limparRecuperacao: () => void;
  /** Entrou com a senha, mas tem verificação em duas etapas e falta o código. */
  faltaSegundaEtapa: boolean;
}

const Contexto = createContext<ContextoSessao>({ sessao: null, carregando: true, recuperandoSenha: false, limparRecuperacao: () => {}, faltaSegundaEtapa: false });

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [recuperandoSenha, setRecuperandoSenha] = useState(false);
  // Falta o código da segunda etapa? null enquanto confere a primeira vez.
  // Quando o token só é renovado, o valor anterior vale até a nova conferência:
  // assim a tela não volta para o carregamento a cada renovação.
  const [falta, setFalta] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSessao(s);
      if (evento === 'PASSWORD_RECOVERY') setRecuperandoSenha(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const token = sessao?.access_token ?? null;
  useEffect(() => {
    if (!token) {
      setFalta(null);
      return;
    }
    let vivo = true;
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (vivo) setFalta(data?.currentLevel === 'aal1' && data?.nextLevel === 'aal2');
    });
    return () => { vivo = false; };
  }, [token]);

  return (
    <Contexto.Provider value={{
      sessao,
      carregando: carregando || (token !== null && falta === null),
      recuperandoSenha,
      limparRecuperacao: () => setRecuperandoSenha(false),
      faltaSegundaEtapa: falta ?? false,
    }}>
      {children}
    </Contexto.Provider>
  );
}

export const useSessao = () => useContext(Contexto);
