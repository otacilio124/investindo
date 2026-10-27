import { AnimatePresence, motion } from 'framer-motion';
import { CandlestickChart, House, Plus, Settings, Target, Wallet } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useOutlet } from 'react-router-dom';
import { carregarPerfil } from '../lib/dados';
import { useSessao } from '../lib/sessao';
import { BarreiraDeErro } from './BarreiraDeErro';

/* ------------------------------------------------------------------ */
/* Cabeçalho de página: título claro e, à direita, a ação da tela      */
/* ------------------------------------------------------------------ */

export function CabecalhoPagina({ titulo, contexto, acoes }: { titulo: string; contexto?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="cab-pagina">
      <div className="cab-pagina-texto">
        {contexto && <p className="cab-contexto">{contexto}</p>}
        <h1 className="cab-titulo">{titulo}</h1>
      </div>
      {acoes && <div className="cab-acoes">{acoes}</div>}
    </div>
  );
}

/** Compatibilidade com telas antigas (conta, primeiro acesso). */
export function Cabecalho({ sobretitulo }: { sobretitulo?: string; valor?: ReactNode; children?: ReactNode }) {
  return sobretitulo ? <CabecalhoPagina titulo={sobretitulo} /> : null;
}

/* ------------------------------------------------------------------ */
/* Navegação                                                           */
/* ------------------------------------------------------------------ */

const PRINCIPAIS = [
  { para: '/', rotulo: 'Início', Icone: House },
  { para: '/carteira', rotulo: 'Carteira', Icone: Wallet },
  { para: '/mercado', rotulo: 'Mercado', Icone: CandlestickChart },
  { para: '/metas', rotulo: 'Metas', Icone: Target },
];

function useNome() {
  const { sessao } = useSessao();
  const [nome, setNome] = useState<string>('');
  useEffect(() => {
    if (sessao) carregarPerfil().then((p) => setNome(p.nome)).catch(() => undefined);
  }, [sessao]);
  return { nome, email: sessao?.user.email ?? '' };
}

const iniciais = (nome: string, email: string) =>
  (nome.trim() ? nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]) : [email[0] ?? '?']).join('').toUpperCase();

/** Notebook: lateral completa. Tablet: só ícones. Celular: escondida. */
function Lateral() {
  const { nome, email } = useNome();
  return (
    <aside className="lateral" aria-label="Navegação principal">
      <Link to="/" className="lateral-marca" aria-label="Investindo!, início">
        <img src="/marca/investindo-simbolo-escuro.svg" alt="" width={32} height={32} className="so-tablet" />
        <img src="/marca/investindo-logotipo-escuro.svg" alt="Investindo!" width={150} height={20} className="so-notebook" />
      </Link>

      <Link to="/investir" className="lateral-investir" title="Investir este mês">
        <Plus size={20} strokeWidth={2.25} aria-hidden />
        <span className="so-notebook">Investir este mês</span>
      </Link>

      <nav className="lateral-nav">
        {PRINCIPAIS.map(({ para, rotulo, Icone }) => (
          <NavLink key={para} to={para} end={para === '/'} title={rotulo}>
            <Icone size={20} aria-hidden />
            <span className="so-notebook">{rotulo}</span>
          </NavLink>
        ))}
      </nav>

      <div className="lateral-rodape">
        <NavLink to="/configuracoes" title="Ajustes e conta">
          <span className="avatar" aria-hidden>{iniciais(nome, email)}</span>
          <span className="so-notebook lateral-usuario">
            <b>{nome || 'Sua conta'}</b>
            <small>Ajustes e conta</small>
          </span>
        </NavLink>
      </div>
    </aside>
  );
}

/** Celular: barra superior com a marca e o atalho para a conta. */
function BarraTopo() {
  const { nome, email } = useNome();
  return (
    <header className="barra-topo">
      <Link to="/" aria-label="Investindo!, início">
        <img src="/marca/investindo-logotipo-escuro.svg" alt="Investindo!" width={124} height={17} />
      </Link>
      <Link to="/configuracoes" className="avatar" aria-label="Ajustes e conta">
        {nome || email ? iniciais(nome, email) : <Settings size={18} aria-hidden />}
      </Link>
    </header>
  );
}

/** Celular: abas embaixo, com "Investir" em destaque no centro. */
function Abas() {
  const [a, b, c, d] = PRINCIPAIS;
  const item = ({ para, rotulo, Icone }: (typeof PRINCIPAIS)[number]) => (
    <NavLink key={para} to={para} end={para === '/'}>
      <Icone size={22} aria-hidden />
      <span>{rotulo}</span>
    </NavLink>
  );
  return (
    <nav className="abas" aria-label="Principal">
      {item(a)}
      {item(b)}
      <NavLink to="/investir" className="abas-investir">
        <span className="abas-investir-botao"><Plus size={24} strokeWidth={2.25} aria-hidden /></span>
        <span>Investir</span>
      </NavLink>
      {item(c)}
      {item(d)}
    </nav>
  );
}

export function LayoutApp() {
  const local = useLocation();
  const saida = useOutlet();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [local.pathname]);
  return (
    <div className="shell">
      <Lateral />
      <div className="shell-area">
        <BarraTopo />
        <AnimatePresence mode="wait" initial={false}>
          <motion.main key={local.pathname} className="conteudo" id="conteudo"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <BarreiraDeErro chave={local.pathname}>{saida}</BarreiraDeErro>
          </motion.main>
        </AnimatePresence>
      </div>
      <Abas />
    </div>
  );
}
