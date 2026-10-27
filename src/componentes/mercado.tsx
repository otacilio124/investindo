import { motion } from 'framer-motion';
import { ArrowUpRight, Newspaper } from 'lucide-react';
import { useState } from 'react';
import { formatarPercentual } from '../lib/formato';
import { estadoPregao, formatarPreco, tempoRelativo, type NoticiaRow, type ResumoAtivo } from '../lib/mercado';
import { Sparkline } from './minigraficos';
import { Grupo, Item, PontoVivo } from './movimento';

const seta = (v: number) => (Math.abs(v) < 0.005 ? '—' : v > 0 ? '▲' : '▼');
const classeVar = (v: number) => (Math.abs(v) < 0.005 ? 'neutra' : v > 0 ? 'alta' : 'queda');
const pct = (v: number) => `${v > 0 ? '+' : ''}${formatarPercentual(v)}`;

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
            <span className="valor-pequeno">{formatarPreco(a.ultimo, a.unidade)}</span>
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
      <span className="valor-medio">{formatarPreco(a.ultimo, a.unidade)}</span>
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
