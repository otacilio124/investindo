import { motion } from 'framer-motion';
import { CandlestickChart, GraduationCap, House, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, Target, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useOutlet } from 'react-router-dom';
import { carregarPerfil, useCarregar } from '../lib/dados';
import { carregarResumoMercado, PAINEL_MERCADO, type AtivoMercado } from '../lib/mercado';
import { BuscaAtivos, FaixaCotacoes, StatusPregao } from './mercado';
import { useSessao } from '../lib/sessao';
import { BarreiraDeErro } from './BarreiraDeErro';
import { BoasVindas } from './BoasVindas';

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

/** Logotipo na versão certa para o tema do aparelho (texto escuro no claro, claro no escuro). */
function Marca({ simbolo = false, largura }: { simbolo?: boolean; largura: number }) {
  const nome = simbolo ? 'investindo-simbolo' : 'investindo-logotipo';
  return (
    <picture>
      <source srcSet={`/marca/${nome}-escuro.svg`} media="(prefers-color-scheme: dark)" />
      <img src={`/marca/${nome}.svg`} alt={simbolo ? '' : 'Investindo!'} width={largura} height={simbolo ? largura : Math.round(largura * 0.135)} />
    </picture>
  );
}

const CHAVE_LATERAL = 'investindo:lateral-recolhida';

/** Lateral recolhida (só ícones) no notebook: a escolha fica guardada neste aparelho. */
function useLateralRecolhida(): [boolean, () => void] {
  const [recolhida, setRecolhida] = useState(() => {
    try { return localStorage.getItem(CHAVE_LATERAL) === '1'; } catch { return false; }
  });
  const alternar = () => setRecolhida((r) => {
    try { localStorage.setItem(CHAVE_LATERAL, r ? '0' : '1'); } catch { /* sem armazenamento: vale só nesta visita */ }
    return !r;
  });
  return [recolhida, alternar];
}

/** Notebook: lateral completa ou recolhida. Tablet: só ícones. Celular: escondida. */
function Lateral({ recolhida, alternar }: { recolhida: boolean; alternar: () => void }) {
  const { nome, email } = useNome();
  return (
    <aside className="lateral" aria-label="Navegação principal">
      <div className="lateral-topo">
        <Link to="/" className="lateral-marca" aria-label="Investindo!, início">
          <span className="lateral-simbolo"><Marca simbolo largura={30} /></span>
          <span className="lateral-texto"><Marca largura={140} /></span>
        </Link>
        <button type="button" className="lateral-recolher" onClick={alternar}
          aria-label={recolhida ? 'Mostrar menu completo' : 'Recolher menu'} title={recolhida ? 'Mostrar menu completo' : 'Recolher menu'} aria-pressed={recolhida}>
          {recolhida ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
        </button>
      </div>

      <Link to="/investir" className="lateral-investir" data-dica="Investir este mês" aria-label="Investir este mês">
        <Plus size={20} strokeWidth={2.25} aria-hidden />
        <span className="lateral-texto">Investir este mês</span>
      </Link>

      <nav className="lateral-nav">
        <span className="lateral-secao lateral-texto">Menu</span>
        {PRINCIPAIS.map(({ para, rotulo, Icone }) => (
          <NavLink key={para} to={para} end={para === '/'} data-dica={rotulo} aria-label={rotulo}>
            <Icone size={20} aria-hidden />
            <span className="lateral-texto">{rotulo}</span>
          </NavLink>
        ))}
        <NavLink to="/aprender" data-dica="Aprender a investir" aria-label="Aprender a investir">
          <GraduationCap size={20} aria-hidden />
          <span className="lateral-texto">Aprender</span>
        </NavLink>
      </nav>

      <div className="lateral-rodape">
        <NavLink to="/configuracoes" data-dica="Ajustes e conta" aria-label={recolhida ? 'Ajustes e conta' : undefined}>
          <span className="avatar" aria-hidden>{iniciais(nome, email)}</span>
          <span className="lateral-texto lateral-usuario">
            <b>{nome || 'Sua conta'}</b>
            <small>Ajustes e conta</small>
          </span>
        </NavLink>
      </div>
    </aside>
  );
}

/** Tablet e notebook: barra do topo com a busca de ativos e o estado do pregão. */
function BarraApp() {
  return (
    <header className="barra-app">
      <BuscaAtivos atalho />
      <div className="barra-app-direita"><StatusPregao /></div>
    </header>
  );
}

/** Celular: barra superior com a marca, a busca e o atalho para a conta. */
function BarraTopo() {
  const { nome, email } = useNome();
  const [buscando, setBuscando] = useState(false);
  return (
    <header className="barra-topo">
      {buscando ? (
        <div className="barra-topo-busca">
          <BuscaAtivos autoFocus aoEscolher={() => setBuscando(false)} />
          <button type="button" className="botao-texto" onClick={() => setBuscando(false)}>Fechar</button>
        </div>
      ) : (
        <>
          <Link to="/" aria-label="Investindo!, início"><Marca largura={124} /></Link>
          <span className="barra-topo-acoes">
            <button type="button" className="avatar" aria-label="Buscar ativo" onClick={() => setBuscando(true)}><Search size={18} aria-hidden /></button>
            <Link to="/aprender" className="avatar" aria-label="Aprender a investir"><GraduationCap size={18} aria-hidden /></Link>
            <Link to="/configuracoes" className="avatar" aria-label="Ajustes e conta">
              {nome || email ? iniciais(nome, email) : <Settings size={18} aria-hidden />}
            </Link>
          </span>
        </>
      )}
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

/** Faixa de cotações que corre no rodapé de todas as telas do app. */
function RodapeCotacoes() {
  const perfil = useCarregar(null, carregarPerfil);
  const ativos = useMemo<AtivoMercado[]>(() => {
    const etfs = [...new Set([perfil.dados?.etf_acoes_br ?? 'BOVA11', perfil.dados?.etf_exterior ?? 'IVVB11'])];
    return [...PAINEL_MERCADO, ...etfs.map((codigo) => ({ codigo, nome: codigo, tipo: 'etf' as const, unidade: 'R$' as const }))];
  }, [perfil.dados]);
  const resumo = useCarregar('mercado:rodape', () => carregarResumoMercado(ativos), [ativos]);
  if (!resumo.dados || resumo.dados.length === 0) return null;
  return (
    <footer className="rodape-cotacoes">
      <FaixaCotacoes ativos={resumo.dados} />
    </footer>
  );
}

export function LayoutApp() {
  const local = useLocation();
  const saida = useOutlet();
  const [recolhida, alternar] = useLateralRecolhida();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [local.pathname]);
  return (
    <div className="shell" data-lateral={recolhida ? 'recolhida' : 'aberta'}>
      <Lateral recolhida={recolhida} alternar={alternar} />
      <div className="shell-area">
        <BarraTopo />
        <BarraApp />
        {/* Só a entrada é animada: esperar a saída da tela anterior (AnimatePresence mode="wait") deixava a área vazia
            quando essa animação não terminava, como depois de usar os seletores do Mercado. */}
        <motion.main key={local.pathname} className="conteudo" id="conteudo"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
          <BarreiraDeErro chave={local.pathname}>{saida}</BarreiraDeErro>
        </motion.main>
        <RodapeCotacoes />
      </div>
      <Abas />
      <BoasVindas />
    </div>
  );
}
