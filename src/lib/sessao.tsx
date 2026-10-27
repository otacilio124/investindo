import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

interface ContextoSessao {
  sessao: Session | null;
  carregando: boolean;
  /** true quando a pessoa chegou pelo link de redefinição de senha. */
  recuperandoSenha: boolean;
  limparRecuperacao: () => void;
}

const Contexto = createContext<ContextoSessao>({ sessao: null, carregando: true, recuperandoSenha: false, limparRecuperacao: () => {} });

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [recuperandoSenha, setRecuperandoSenha] = useState(false);

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

  return (
    <Contexto.Provider value={{ sessao, carregando, recuperandoSenha, limparRecuperacao: () => setRecuperandoSenha(false) }}>
      {children}
    </Contexto.Provider>
  );
}

export const useSessao = () => useContext(Contexto);
