import { motion } from 'framer-motion';
import { ArrowUpRight, Newspaper, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatarPercentual } from '../lib/formato';
import {
  buscarAtivos, descricaoAtivo, estadoPregao, formatarPreco, NOME_TIPO, tempoRelativo, unidadeDe,
  type AtivoCatalogo, type NoticiaRow, type ResumoAtivo, type TipoMercado,
} from '../lib/mercado';
import { Sparkline } from './minigraficos';
import { Grupo, Item, PontoVivo } from './movimento';

const seta = (v: number) => (Math.abs(v) < 0.005 ? '—' : v > 0 ? '▲' : '▼');
const classeVar = (v: number) => (Math.abs(v) < 0.005 ? 'neutra' : v > 0 ? 'alta' : 'queda');
const pct = (v: number) => `${v > 0 ? '+' : ''}${formatarPercentual(v)}`;

const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
/** 74.122.600 vira "74,1 mi". */
export const formatarCompacto = (v: number | null | undefined) => (v === null || v === undefined ? '—' : compacto.format(v));

/** Variação em pílula colorida, como nos apps de bolsa. */
export function PilulaVariacao({ valor, grande = false }: { valor: number | null; grande?: boolean }) {
  if (valor === null) return <span className="pilula-var neutra">—</span>;
  return <span className={`pilula-var ${classeVar(valor)}${grande ? ' grande' : ''}`}>{pct(valor)}</span>;
}

const SIMBOLO_TIPO: Partial<Record<TipoMercado, string>> = { cripto: '₿', moeda: '¤', commodity: '◆' };

/** Logo da empresa quando existe; senão, as letras do código num círculo com a cor do tipo. */
export function LogoAtivo({ codigo, tipo, logo, tamanho = 36 }: { codigo: string; tipo?: TipoMercado; logo?: string | null; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [logo]);
  const letras = SIMBOLO_TIPO[tipo ?? 'acao'] ?? codigo.replace(/^\^/, '').slice(0, tipo === 'indice' ? 3 : 2);
  return (
    <span className="logo-ativo" data-tipo={tipo} style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.34 }} aria-hidden>
      {logo && !falhou ? <img src={logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFalhou(true)} /> : letras}
    </span>
  );
}

/**
 * Busca de ativos com teclado (setas, Enter, Esc) e atalho Ctrl+K / ⌘K.
 * Escolher um resultado abre o ativo no Mercado.
 */
export function BuscaAtivos({ atalho = false, autoFocus = false, aoEscolher }: { atalho?: boolean; autoFocus?: boolean; aoEscolher?: () => void }) {
  const navegar = useNavigate();
  const id = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<AtivoCatalogo[]>([]);
  const [aberta, setAberta] = useState(false);
  const [indice, setIndice] = useState(0);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (!atalho) return;
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        campo.current?.focus();
        campo.current?.select();
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [atalho]);

  useEffect(() => {
    const t = termo.trim();
    if (!t) { setResultados([]); return; }
    let vivo = true;
    setBuscando(true);
    const espera = setTimeout(() => {
      buscarAtivos(t)
        .then((r) => { if (vivo) { setResultados(r); setIndice(0); } })
        .catch(() => { if (vivo) setResultados([]); })
        .finally(() => { if (vivo) setBuscando(false); });
    }, 180);
    return () => { vivo = false; clearTimeout(espera); };
  }, [termo]);

  function escolher(a: AtivoCatalogo) {
    navegar(`/mercado?ativo=${encodeURIComponent(a.codigo)}`);
    setTermo('');
    setAberta(false);
    campo.current?.blur();
    aoEscolher?.();
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndice((i) => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndice((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && resultados[indice]) { e.preventDefault(); escolher(resultados[indice]); }
    else if (e.key === 'Escape') { setAberta(false); campo.current?.blur(); }
  }

  const mostrar = aberta && termo.trim().length > 0;
  return (
    <div className="busca-ativos" data-aberta={mostrar}>
      <label className="busca-campo">
        <Search size={18} aria-hidden />
        <span className="visualmente-oculto">Buscar ativo</span>
        <input
          ref={campo} type="search" value={termo} autoFocus={autoFocus} autoComplete="off" spellCheck={false}
          placeholder="Buscar ação, FII, ETF, índice, moeda…"
          role="combobox" aria-expanded={mostrar} aria-controls={`${id}-lista`} aria-autocomplete="list"
          aria-activedescendant={mostrar && resultados[indice] ? `${id}-${indice}` : undefined}
          onChange={(e) => { setTermo(e.target.value); setAberta(true); }}
          onFocus={() => setAberta(true)} onBlur={() => setTimeout(() => setAberta(false), 150)} onKeyDown={teclado}
        />
        {termo ? (
          <button type="button" className="busca-limpar" aria-label="Limpar busca" onMouseDown={(e) => e.preventDefault()} onClick={() => setTermo('')}><X size={16} aria-hidden /></button>
        ) : atalho && <kbd className="busca-atalho" aria-hidden>Ctrl K</kbd>}
      </label>
      {mostrar && (
        <ul className="busca-resultados" id={`${id}-lista`} role="listbox" aria-label="Ativos encontrados">
          {resultados.map((a, i) => (
            <li key={a.codigo} id={`${id}-${i}`} role="option" aria-selected={i === indice}
              onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(a)} onMouseEnter={() => setIndice(i)}>
              <LogoAtivo codigo={a.codigo} tipo={a.tipo} logo={a.logo_url} tamanho={32} />
              <span className="busca-nome"><b>{a.codigo}</b><small>{descricaoAtivo(a)}</small></span>
              <span className="busca-tipo">{NOME_TIPO[a.tipo]}</span>
              <span className="busca-preco">
                {a.preco !== null && <span className="valor-pequeno">{formatarPreco(a.preco, unidadeDe(a))}</span>}
                <PilulaVariacao valor={a.variacao} />
              </span>
            </li>
          ))}
          {!buscando && resultados.length === 0 && <li className="busca-vazia" role="presentation">Nada encontrado para “{termo.trim()}”.</li>}
          {buscando && resultados.length === 0 && <li className="busca-vazia" role="presentation">Buscando…</li>}
        </ul>
      )}
    </div>
  );
}

/** Faixa de cotações que corre devagar; para no hover e fica parada com "reduzir movimento". */
export function FaixaCotacoes({ ativos }: { ativos: ResumoAtivo[] }) {
  if (ativos.length === 0) return null;
  const itens = [...ativos, ...ativos];
  return (
    <div className="faixa-cotacoes" aria-label="Cotações do último pregão">
      <div className="faixa-trilho">
        {itens.map((a, i) => (
          <span key={`${a.codigo}-${i}`} className="faixa-item" aria-hidden={i >= ativos.length}>
            <b>{a.nome}</b>
            <span className="valor-pequeno">{formatarPreco(a.ultimo, a.unidade, a.tipo)}</span>
            <span className={`valor-pequeno ${classeVar(a.variacao)}`}>{seta(a.variacao)} {pct(a.variacao)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatusPregao() {
  const estado = estadoPregao();
  const texto = estado === 'aberto' ? 'Pregão aberto' : estado === 'pre' ? 'Pré-abertura' : 'Pregão fechado';
  return (
    <span className="status-pregao">
      <PontoVivo ativo={estado === 'aberto'} /> {texto}
    </span>
  );
}

export function CartaoAtivo({ a, selecionado, aoClicar }: { a: ResumoAtivo; selecionado?: boolean; aoClicar?: () => void }) {
  return (
    <motion.button type="button" className="cartao cartao-ativo" data-selecionado={selecionado} onClick={aoClicar}
      whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }} aria-pressed={selecionado}>
      <div className="linha-entre">
        <span className="sobretitulo suave">{a.nome}</span>
        <span className="codigo-ativo">{a.codigo}</span>
      </div>
      <span className="valor-medio">{formatarPreco(a.ultimo, a.unidade, a.tipo)}</span>
      <div className="linha-entre" style={{ alignItems: 'end' }}>
        <span className={`valor-pequeno ${classeVar(a.variacao)}`}>{seta(a.variacao)} {pct(a.variacao)}</span>
        <Sparkline valores={a.serie} largura={96} altura={32} />
      </div>
    </motion.button>
  );
}

export function ListaNoticias({ noticias, limite, compacta = false }: { noticias: NoticiaRow[]; limite?: number; compacta?: boolean }) {
  const fontes = [...new Set(noticias.map((n) => n.fonte))];
  const [filtro, setFiltro] = useState<string | null>(null);
  const lista = noticias.filter((n) => !filtro || n.fonte === filtro).slice(0, limite);

  if (noticias.length === 0) {
    return <p className="suave corpo-pequeno">Ainda sem notícias coletadas. Elas chegam a cada 30 minutos.</p>;
  }

  return (
    <div className="pilha">
      {!compacta && fontes.length > 1 && (
        <div className="chips" role="tablist" aria-label="Filtrar por fonte">
          {[null, ...fontes].map((f) => (
            <button key={f ?? 'todas'} role="tab" aria-selected={filtro === f} className="chip" onClick={() => setFiltro(f)}>
              {filtro === f && <motion.span layoutId="chip-ativo" className="chip-fundo" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              <span>{f ?? 'Todas'}</span>
            </button>
          ))}
        </div>
      )}
      <Grupo como="ul" className={`lista-noticias ${compacta ? 'compacta' : ''}`} key={filtro ?? 'todas'}>
        {lista.map((n) => (
          <Item como="li" key={n.id}>
            <a className="noticia" href={n.url} target="_blank" rel="noopener noreferrer">
              {!compacta && (
                <div className="noticia-imagem">
                  {n.imagem_url
                    ? <img src={n.imagem_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    : <Newspaper size={24} className="icone" aria-hidden />}
                </div>
              )}
              <div className="noticia-texto">
                <span className="noticia-meta">{n.fonte} · {tempoRelativo(n.publicado_em)}</span>
                <strong className="noticia-titulo">{n.titulo}</strong>
                {!compacta && n.resumo && <span className="noticia-resumo">{n.resumo}</span>}
              </div>
              <ArrowUpRight size={18} className="icone noticia-seta" aria-hidden />
            </a>
          </Item>
        ))}
      </Grupo>
    </div>
  );
}
