import { motion } from 'framer-motion';
import { CandlestickChart, LineChart } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Carregando, ErroCarga } from '../componentes/base';
import { Cabecalho } from '../componentes/Estrutura';
import { GraficoCandles, PERIODOS, recortar, type LegendaOHLC, type Periodo } from '../componentes/graficos';
import { CartaoAtivo, FaixaCotacoes, ListaNoticias, StatusPregao } from '../componentes/mercado';
import { Grupo, Item } from '../componentes/movimento';
import { carregarPerfil, useCarregar } from '../lib/dados';
import { formatarData, formatarPercentual } from '../lib/formato';
import { carregarCandles, carregarNoticias, carregarResumoMercado, formatarPreco, PAINEL_MERCADO, type AtivoMercado } from '../lib/mercado';

function Seletor<T extends string>({ opcoes, valor, aoMudar, nome, rotulo }: {
  opcoes: { valor: T; rotulo: React.ReactNode; titulo?: string }[]; valor: T; aoMudar: (v: T) => void; nome: string; rotulo: string;
}) {
  return (
    <div className="seletor" role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={valor === o.valor} title={o.titulo} onClick={() => aoMudar(o.valor)}>
          {valor === o.valor && <motion.span layoutId={`seletor-${nome}`} className="seletor-fundo" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
          <span>{o.rotulo}</span>
        </button>
      ))}
    </div>
  );
}

export default function Mercado() {
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

  const ativo = painel.find((a) => a.codigo === codigo) ?? painel[0];
  const visiveis = useMemo(() => recortar(candles.dados ?? [], periodo), [candles.dados, periodo]);
  const ultimo = visiveis[visiveis.length - 1];
  const legenda = cursor ?? (ultimo ? { candle: ultimo, variacao: visiveis.length > 1 ? ((ultimo.fechamento - visiveis[visiveis.length - 2].fechamento) / visiveis[visiveis.length - 2].fechamento) * 100 : 0 } : null);
  const varPeriodo = visiveis.length > 1 ? ((ultimo.fechamento - visiveis[0].abertura) / visiveis[0].abertura) * 100 : 0;
  const maxima = visiveis.length ? Math.max(...visiveis.map((c) => c.maxima)) : 0;
  const minima = visiveis.length ? Math.min(...visiveis.map((c) => c.minima)) : 0;
  const fmt = (v: number) => formatarPreco(v, ativo.unidade);
  const sinal = (v: number) => `${v >= 0 ? '▲ +' : '▼ '}${formatarPercentual(v)}`;

  return (
    <>
      <Cabecalho sobretitulo="Mercado">
        <StatusPregao />
      </Cabecalho>
      {resumo.dados && <FaixaCotacoes ativos={resumo.dados} />}
      <main className="pagina pagina-larga">
        {resumo.carregando && !resumo.dados && <div className="grade-ativos">{painel.map((a) => <div key={a.codigo} className="cartao esqueleto" style={{ height: 116 }} />)}</div>}
        {resumo.dados && (
          <Grupo className="grade-ativos">
            {resumo.dados.map((a) => (
              <Item key={a.codigo}><CartaoAtivo a={a} selecionado={a.codigo === codigo} aoClicar={() => { setCodigo(a.codigo); setCursor(null); }} /></Item>
            ))}
          </Grupo>
        )}

        <section className="cartao cartao-grafico pilha">
          <div className="grafico-topo">
            <div className="pilha-curta">
              <span className="sobretitulo suave">{ativo.nome} · diário</span>
              {legenda && (
                <div className="ohlc">
                  <span className="valor-medio">{fmt(legenda.candle.fechamento)}</span>
                  <span className={`valor-pequeno ${legenda.variacao >= 0 ? 'alta' : 'queda'}`}>{sinal(legenda.variacao)}</span>
                  <span className="ohlc-detalhe">
                    <span>A <b>{fmt(legenda.candle.abertura)}</b></span>
                    <span>Máx <b>{fmt(legenda.candle.maxima)}</b></span>
                    <span>Mín <b>{fmt(legenda.candle.minima)}</b></span>
                    <span>{formatarData(legenda.candle.data)}</span>
                  </span>
                </div>
              )}
            </div>
            <div className="grafico-controles">
              <Seletor nome="periodo" rotulo="Período" valor={periodo} aoMudar={setPeriodo} opcoes={PERIODOS.map((p) => ({ valor: p, rotulo: p }))} />
              <Seletor nome="tipo" rotulo="Tipo de gráfico" valor={tipo} aoMudar={setTipo} opcoes={[
                { valor: 'candles', rotulo: <CandlestickChart size={16} className="icone" aria-hidden />, titulo: 'Candles' },
                { valor: 'linha', rotulo: <LineChart size={16} className="icone" aria-hidden />, titulo: 'Linha' },
              ]} />
              <button type="button" className="chip" aria-pressed={medias} data-ativo={medias} onClick={() => setMedias(!medias)}>MM 20/50</button>
            </div>
          </div>

          {candles.carregando && !candles.dados && <div className="esqueleto" style={{ height: 360 }} />}
          {!candles.carregando && !candles.dados && <ErroCarga mensagem={candles.erro ?? ''} tentarDeNovo={candles.recarregar} />}
          {candles.dados && candles.dados.length === 0 && <p className="suave">Sem histórico deste ativo ainda.</p>}
          {visiveis.length > 0 && <GraficoCandles candles={visiveis} tipo={tipo} medias={medias} casas={ativo.unidade === 'pts' ? 0 : ativo.codigo === 'USDBRL' ? 4 : 2} aoMoverCursor={aoMoverCursor} />}

          {visiveis.length > 1 && (
            <div className="estatisticas">
              <div><span className="legenda">Variação em {periodo}</span><b className={varPeriodo >= 0 ? 'alta' : 'queda'}>{sinal(varPeriodo)}</b></div>
              <div><span className="legenda">Máxima</span><b>{fmt(maxima)}</b></div>
              <div><span className="legenda">Mínima</span><b>{fmt(minima)}</b></div>
              <div><span className="legenda">Pregões</span><b>{visiveis.length}</b></div>
            </div>
          )}
          {medias && <p className="legenda"><i className="traco-legenda" style={{ background: 'var(--ouro)' }} /> Média de 20 pregões <i className="traco-legenda" style={{ background: 'var(--tinta-suave)' }} /> Média de 50 pregões · Fonte: Yahoo Finance</p>}
        </section>

        <section className="pilha">
          <div className="linha-entre">
            <h2 className="subtitulo">Notícias de economia</h2>
            <span className="legenda">Agência Brasil · g1 · InfoMoney</span>
          </div>
          {noticias.carregando && !noticias.dados && <Carregando />}
          {noticias.dados && <ListaNoticias noticias={noticias.dados} />}
          {!noticias.carregando && !noticias.dados && <ErroCarga mensagem={noticias.erro ?? ''} tentarDeNovo={noticias.recarregar} />}
          <p className="legenda">As notícias abrem no site de cada veículo. O Investindo! não comenta nem recomenda com base nelas.</p>
        </section>
      </main>
    </>
  );
}
