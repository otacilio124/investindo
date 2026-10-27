import { AnimatePresence, motion } from 'framer-motion';
import { CandlestickChart, House, Settings, Target, TrendingUp, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useLocation, useOutlet } from 'react-router-dom';
import { Logotipo } from './base';
import { BarreiraDeErro } from './BarreiraDeErro';
import { SUAVE } from './movimento';

/** Cabeçalho das telas principais: fundo floresta com grade fina, logotipo escuro, sobretítulo + valor. */
export function Cabecalho({ sobretitulo, valor, children }: { sobretitulo?: string; valor?: ReactNode; children?: ReactNode }) {
  return (
    <header className="cabecalho">
      <div className="cabecalho-conteudo">
        <div className="linha-entre" style={{ alignItems: 'center' }}>
          <Logotipo escuro largura={132} />
        </div>
        {sobretitulo && (
          <motion.div className="pilha-curta" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: SUAVE }}>
            <span className="sobretitulo">{sobretitulo}</span>
            {valor && <span className="valor valor-heroi">{valor}</span>}
          </motion.div>
        )}
        {children}
      </div>
    </header>
  );
}

const ITENS = [
  { para: '/', rotulo: 'Início', Icone: House },
  { para: '/mercado', rotulo: 'Mercado', Icone: CandlestickChart },
  { para: '/investir', rotulo: 'Investir', Icone: TrendingUp },
  { para: '/carteira', rotulo: 'Carteira', Icone: Wallet },
  { para: '/metas', rotulo: 'Metas', Icone: Target },
  { para: '/configuracoes', rotulo: 'Ajustes', Icone: Settings },
];

export function Navegacao() {
  const { pathname } = useLocation();
  return (
    <nav className="navegacao" aria-label="Principal">
      {ITENS.map(({ para, rotulo, Icone }) => {
        const ativo = para === '/' ? pathname === '/' : pathname.startsWith(para);
        return (
          <NavLink key={para} to={para} end={para === '/'}>
            {ativo && <motion.span layoutId="nav-ativo" className="nav-indicador" transition={{ type: 'spring', stiffness: 480, damping: 38 }} />}
            <Icone size={22} strokeWidth={2} aria-hidden />
            {rotulo}
          </NavLink>
        );
      })}
    </nav>
  );
}

/** Troca de tela com fade curto; cada tela entra de 8 px abaixo. */
export function LayoutApp() {
  const local = useLocation();
  const saida = useOutlet();
  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={local.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: SUAVE }}>
          <BarreiraDeErro chave={local.pathname}>{saida}</BarreiraDeErro>
        </motion.div>
      </AnimatePresence>
      <Navegacao />
    </>
  );
}
