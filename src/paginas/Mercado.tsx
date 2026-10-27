import { motion } from 'framer-motion';
import { CandlestickChart, LineChart } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ErroCarga } from '../componentes/base';
import { CabecalhoPagina } from '../componentes/Estrutura';
import { GraficoCandles, PERIODOS, recortar, type LegendaOHLC, type Periodo } from '../componentes/graficos';
import { ListaNoticias, StatusPregao } from '../componentes/mercado';
import { Sparkline } from '../componentes/minigraficos';
import { carregarPerfil, useCarregar } from '../lib/dados';
import { formatarData, formatarPercentual } from '../lib/formato';
import { carregarCandles, carregarNoticias, carregarResumoMercado, formatarPreco, PAINEL_MERCADO, type AtivoMercado } from '../lib/mercado';

function Seletor<T extends string>({ opcoes, valor, aoMudar, nome, rotulo }: {
  opcoes: { valor: T; rotulo: React.ReactNode; titulo?: string }[]; valor: T; aoMudar: (v: T) => void; nome: string; rotulo: string;
}) {
  return (
    <div className="seletor" role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={valor === o.valor} title={o.titulo} aria-label={o.titulo} onClick={() => aoMudar(o.valor)}>
          {valor === o.valor && <motion.span layoutId={`seletor-${nome}`} className="seletor-fundo" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
          <span>{o.rotulo}</span>
        </button>
      ))}
    </div>
  );
}

const sinal = (v: number) => `${v >= 0 ? '▲ +' : '▼ '}${formatarPercentual(v)}`;

export default function Mercado() {
  const local = useLocation();
  const perfil = useCarregar(null, carregarPerfil);
  const painel: AtivoMercado[] = useMemo(() => {
    const etfs = perfil.dados ? [perfil.dados.etf_acoes_br, perfil.dados.etf_exterior] : ['BOVA11', 'IVVB11'];
    return [...PAINEL_MERCADO, ...etfs.map((codigo) => ({ codigo, nome: codigo, tipo: 'etf' as const, unidade: 'R$' as const }))];
  }, [perfil.dados]);

  const resumo = useCarregar('mercado:resumo', () => carregarResumoMercado(painel), [painel]);
  const noticias = useCarregar('mercado:noticias', () => carregarNoticias(30));
  const [codigo, setCodigo] = useState('IBOV');
  const candles = useCarregar(`mercado:candles:${codigo}`, () => carregarCandles(codigo), [codigo]);
  const [periodo, setPeriodo] = useState<Periodo>('6M');
  const [tipo, setTipo] = useState<'candles' | 'linha'>('candles');
  const [medias, setMedias] = useState(true);
  const [cursor, setCursor] = useState<LegendaOHLC | null>(null);
  const aoMoverCursor = useCallback((l: LegendaOHLC | null) => setCursor(l), []);

  useEffect(() => {
    if (local.hash === '#noticias') document.getElementById('noticias')?.scrollIntoView();
  }, [local.hash, noticias.dados]);

  const ativo = painel.find((a) => a.codigo === codigo) ?? painel[0];
  const visiveis = useMemo(() => recortar(candles.dados ?? [], periodo), [candles.dados, periodo]);
  const ultimo = visiveis[visiveis.length - 1];
  const anterior = visiveis[visiveis.length - 2];
  const legenda = cursor ?? (ultimo ? { candle: ultimo, variacao: anterior ? ((ultimo.fechamento - anterior.fechamento) / anterior.fechamento) * 100 : 0 } : null);
  const varPeriodo = visiveis.length > 1 ? ((ultimo.fechamento - visiveis[0].abertura) / visiveis[0].abertura) * 100 : 0;
  const maxima = visiveis.length ? Math.max(...visiveis.map((c) => c.maxima)) : 0;
  const minima = visiveis.length ? Math.min(...visiveis.map((c) => c.minima)) : 0;
  const fmt = (v: number) => formatarPreco(v, ativo.unidade);
  const escolher = (c: string) => { setCodigo(c); setCursor(null); };

  return (
    <>
      <CabecalhoPagina titulo="Mercado" contexto="Preços de fechamento diário" acoes={<StatusPregao />} />

      <div className="grade">
        {/* Lista de acompanhamento */}
        <section className="painel n-4 t-12 painel-acompanhando" aria-label="Ativos acompanhados">
          <div className="painel-titulo"><h2>Acompanhando</h2></div>
          {!resumo.dados && <div className="esqueleto" style={{ height: 260 }} />}
          {resumo.dados && (
            <ul className="linhas lista-acompanhando">
              {resumo.dados.map((a) => (
                <li key={a.codigo} style={{ padding: 0, borderTop: 0 }}>
                  <button type="button" className="linha-mercado" aria-pressed={a.codigo === codigo} onClick={() => escolher(a.codigo)}
                    style={{ display: 'grid', padding: '12px 4px', borderTop: '1px solid var(--linha)' }}>
                    <div><b>{a.nome}</b>{a.nome !== a.codigo && <small>{a.codigo}</small>}</div>
                    <Sparkline valores={a.serie} largura={80} altura={28} area={false} />
                    <div className="preco">
                      <span className="valor-pequeno">{formatarPreco(a.ultimo, a.unidade)}</span>
                      <span className={`valor-pequeno ${a.variacao >= 0 ? 'alta' : 'queda'}`} style={{ fontSize: 12 }}>{sinal(a.variacao)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Gráfico */}
        <section className="painel n-8 t-12">
          <div className="grafico-topo">
            <div style={{ display: 'grid', gap: 4 }}>
              <span className="corpo-pequeno suave">{ativo.nome}{ativo.nome !== ativo.codigo && ` · ${ativo.codigo}`}</span>
              {legenda && (
                <>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span className="valor-medio" style={{ fontSize: '1.5rem' }}>{fmt(legenda.candle.fechamento)}</span>
                    <span className={`valor-pequeno ${legenda.variacao >= 0 ? 'alta' : 'queda'}`}>{sinal(legenda.variacao)}</span>
                  </div>
                  <span className="ohlc-detalhe">
                    <span>{formatarData(legenda.candle.data)}</span>
                    <span>Abertura <b>{fmt(legenda.candle.abertura)}</b></span>
                    <span>Máx <b>{fmt(legenda.candle.maxima)}</b></span>
                    <span>Mín <b>{fmt(legenda.candle.minima)}</b></span>
                  </span>
                </>
              )}
            </div>
            <div className="grafico-controles">
              <Seletor nome="periodo" rotulo="Período" valor={periodo} aoMudar={setPeriodo} opcoes={PERIODOS.map((p) => ({ valor: p, rotulo: p }))} />
              <Seletor nome="tipo" rotulo="Tipo de gráfico" valor={tipo} aoMudar={setTipo} opcoes={[
                { valor: 'candles', rotulo: <CandlestickChart size={16} aria-hidden />, titulo: 'Candles' },
                { valor: 'linha', rotulo: <LineChart size={16} aria-hidden />, titulo: 'Linha' },
              ]} />
            </div>
          </div>

          {candles.carregando && !candles.dados && <div className="esqueleto" style={{ height: 360 }} />}
          {!candles.carregando && !candles.dados && <ErroCarga mensagem={candles.erro ?? ''} tentarDeNovo={candles.recarregar} />}
          {candles.dados && candles.dados.length === 0 && <p className="suave">Ainda sem histórico deste ativo.</p>}
          {visiveis.length > 0 && (
            <GraficoCandles candles={visiveis} tipo={tipo} medias={medias} casas={ativo.unidade === 'pts' ? 0 : ativo.codigo === 'USDBRL' ? 4 : 2} aoMoverCursor={aoMoverCursor} />
          )}

          {visiveis.length > 1 && (
            <div className="estatisticas">
              <div><span className="nota">Variação em {periodo}</span><b className={varPeriodo >= 0 ? 'alta' : 'queda'}>{sinal(varPeriodo)}</b></div>
              <div><span className="nota">Máxima</span><b>{fmt(maxima)}</b></div>
              <div><span className="nota">Mínima</span><b>{fmt(minima)}</b></div>
              <div>
                <span className="nota">Médias móveis</span>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                  <input type="checkbox" checked={medias} onChange={(e) => setMedias(e.target.checked)} style={{ accentColor: 'var(--verde)' }} />
                  <span><i className="traco-legenda" style={{ background: 'var(--ouro)', margin: '0 4px 0 0' }} />20 <i className="traco-legenda" style={{ background: 'var(--tinta-suave)', margin: '0 4px 0 6px' }} />50 dias</span>
                </label>
              </div>
            </div>
          )}
          <p className="nota">Toque ou passe o mouse sobre o gráfico para ver cada dia. Fonte: Yahoo Finance.</p>
        </section>

        {/* Notícias */}
        <section className="painel n-12" id="noticias" style={{ scrollMarginTop: 80 }}>
          <div className="painel-titulo">
            <h2>Notícias de economia</h2>
            <span className="nota">Agência Brasil, g1 e InfoMoney</span>
          </div>
          {noticias.carregando && !noticias.dados && <div className="esqueleto" style={{ height: 300 }} />}
          {noticias.dados && <ListaNoticias noticias={noticias.dados} />}
          {!noticias.carregando && !noticias.dados && <ErroCarga mensagem={noticias.erro ?? ''} tentarDeNovo={noticias.recarregar} />}
          <p className="nota">As notícias abrem no site de cada veículo. O app não comenta nem recomenda com base nelas.</p>
        </section>
      </div>
    </>
  );
}
