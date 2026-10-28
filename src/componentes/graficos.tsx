import { motion } from 'framer-motion';
import {
  ColorType,
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import type { Candle } from '../lib/mercado';
import { useCoresGrafico } from './base';

/* ------------------------------------------------------------------ */
/* Base do TradingView Lightweight Charts com tema da marca            */
/* ------------------------------------------------------------------ */

/** Gráficos já destruídos (troca de tema/desmontagem): nenhum efeito pode mais usá-los. */
const destruidos = new WeakSet<IChartApi>();
const vivo = (g: IChartApi | null): g is IChartApi => g !== null && !destruidos.has(g);

function useGrafico(altura: number) {
  const caixa = useRef<HTMLDivElement>(null);
  const [grafico, setGrafico] = useState<IChartApi | null>(null);
  const cor = useCoresGrafico();

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const g = createChart(el, {
      width: el.clientWidth,
      height: altura,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: cor['tinta-suave'],
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: cor.linha, style: LineStyle.Dotted },
        horzLines: { color: cor.linha, style: LineStyle.Dotted },
      },
      rightPriceScale: { borderColor: cor.linha, scaleMargins: { top: 0.1, bottom: 0.22 } },
      timeScale: { borderColor: cor.linha, rightOffset: 3, minBarSpacing: 2 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: cor['tinta-suave'], width: 1, style: LineStyle.Dashed, labelBackgroundColor: cor.floresta },
        horzLine: { color: cor['tinta-suave'], width: 1, style: LineStyle.Dashed, labelBackgroundColor: cor.floresta },
      },
      localization: {
        locale: 'pt-BR',
        priceFormatter: (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      },
      handleScale: { axisPressedMouseMove: false },
    });
    setGrafico(g);
    const observador = new ResizeObserver(([e]) => g.applyOptions({ width: Math.floor(e.contentRect.width) }));
    observador.observe(el);
    return () => {
      observador.disconnect();
      destruidos.add(g);
      g.remove();
      setGrafico(null);
    };
    // cores mudam com o tema: recria o gráfico
  }, [altura, cor]);

  return { caixa, grafico, cor };
}

/**
 * Ao trocar o tema o gráfico é recriado; a limpeza das séries do gráfico
 * antigo pode chegar depois dele já ter sido destruído. Nesse caso não há o
 * que remover.
 */
function removerSeries(g: IChartApi, series: ISeriesApi<'Candlestick' | 'Area' | 'Line' | 'Histogram'>[]) {
  if (!vivo(g)) return;
  for (const s of series) {
    try {
      g.removeSeries(s);
    } catch {
      /* gráfico já destruído */
    }
  }
}

/* ------------------------------------------------------------------ */
/* Candlestick com volume, médias móveis e legenda OHLC                */
/* ------------------------------------------------------------------ */

export type Periodo = '1M' | '3M' | '6M' | '1A' | '2A';
const DIAS_PERIODO: Record<Periodo, number> = { '1M': 31, '3M': 92, '6M': 183, '1A': 366, '2A': 732 };
export const PERIODOS = Object.keys(DIAS_PERIODO) as Periodo[];

export function recortar(candles: Candle[], p: Periodo): Candle[] {
  if (candles.length === 0) return candles;
  const ultimo = new Date(`${candles[candles.length - 1].data}T12:00:00Z`);
  ultimo.setUTCDate(ultimo.getUTCDate() - DIAS_PERIODO[p]);
  const corte = ultimo.toISOString().slice(0, 10);
  return candles.filter((c) => c.data >= corte);
}

export function mediaMovel(candles: Candle[], n: number) {
  const saida: { time: Time; value: number }[] = [];
  let soma = 0;
  candles.forEach((c, i) => {
    soma += c.fechamento;
    if (i >= n) soma -= candles[i - n].fechamento;
    if (i >= n - 1) saida.push({ time: c.data as Time, value: soma / n });
  });
  return saida;
}

export interface LegendaOHLC {
  candle: Candle;
  variacao: number;
}

export function GraficoCandles({ candles, tipo, medias, altura = 360, casas = 2, aoMoverCursor }: {
  candles: Candle[];
  tipo: 'candles' | 'linha';
  medias: boolean;
  altura?: number;
  /** Casas decimais do eixo de preço (índices em pontos: 0). */
  casas?: number;
  aoMoverCursor?: (l: LegendaOHLC | null) => void;
}) {
  const { caixa, grafico, cor } = useGrafico(altura);

  useEffect(() => {
    if (!vivo(grafico)) return;
    grafico.applyOptions({
      localization: { locale: 'pt-BR', priceFormatter: (p: number) => p.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) },
    });
  }, [grafico, casas]);

  useEffect(() => {
    if (!vivo(grafico) || candles.length === 0) return;
    const criadas: ISeriesApi<'Candlestick' | 'Area' | 'Line' | 'Histogram'>[] = [];
    const series = { current: criadas };

    const subiu = candles[candles.length - 1].fechamento >= candles[0].fechamento;
    const principal = tipo === 'candles'
      ? grafico.addCandlestickSeries({
          upColor: cor.verde, downColor: cor.negativo,
          borderUpColor: cor.verde, borderDownColor: cor.negativo,
          wickUpColor: cor.verde, wickDownColor: cor.negativo,
          priceLineColor: cor['tinta-suave'],
        })
      : grafico.addAreaSeries({
          lineColor: subiu ? cor.verde : cor.negativo, lineWidth: 2,
          topColor: `${subiu ? cor.verde : cor.negativo}55`, bottomColor: `${subiu ? cor.verde : cor.negativo}00`,
          priceLineColor: cor['tinta-suave'],
        });
    if (tipo === 'candles') {
      (principal as ISeriesApi<'Candlestick'>).setData(candles.map((c) => ({ time: c.data as Time, open: c.abertura, high: c.maxima, low: c.minima, close: c.fechamento })));
    } else {
      (principal as ISeriesApi<'Area'>).setData(candles.map((c) => ({ time: c.data as Time, value: c.fechamento })));
    }
    series.current.push(principal);

    if (candles.some((c) => c.volume > 0)) {
      const volume = grafico.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volume.setData(candles.map((c, i) => ({
        time: c.data as Time, value: c.volume,
        color: `${c.fechamento >= (candles[i - 1]?.fechamento ?? c.abertura) ? cor.verde : cor.negativo}66`,
      })));
      series.current.push(volume);
    }

    if (medias) {
      for (const [n, c] of [[20, cor.ouro], [50, cor['tinta-suave']]] as const) {
        if (candles.length <= n) continue;
        const linha = grafico.addLineSeries({ color: c, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        linha.setData(mediaMovel(candles, n));
        series.current.push(linha);
      }
    }
    grafico.timeScale().fitContent();
    return () => removerSeries(grafico, criadas);
    // `cor` fica de fora: trocar o tema recria o gráfico, e o efeito roda de novo com o gráfico novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grafico, candles, tipo, medias]);

  useEffect(() => {
    if (!vivo(grafico) || !aoMoverCursor) return;
    const porData = new Map(candles.map((c, i) => [c.data, i]));
    const ouvir = (p: MouseEventParams) => {
      const i = p.time ? porData.get(String(p.time)) : undefined;
      if (i === undefined) return aoMoverCursor(null);
      const c = candles[i];
      const ant = candles[i - 1]?.fechamento ?? c.abertura;
      aoMoverCursor({ candle: c, variacao: ((c.fechamento - ant) / ant) * 100 });
    };
    grafico.subscribeCrosshairMove(ouvir);
    return () => {
      if (vivo(grafico)) grafico.unsubscribeCrosshairMove(ouvir);
    };
  }, [grafico, candles, aoMoverCursor]);

  return (
    <motion.div ref={caixa} className="grafico-tv" style={{ height: altura }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} />
  );
}

/* ------------------------------------------------------------------ */
/* Evolução do patrimônio: área do valor e linha do que foi aplicado   */
/* ------------------------------------------------------------------ */

export interface LinhaReferencia {
  nome: string;
  /** Nome de um token de cor do tema (ex.: 'ouro', 'tinta'). */
  token: 'ouro' | 'tinta' | 'negativo' | 'floresta';
  pontos: { data: string; valor: number }[];
}

export function GraficoEvolucao({ pontos, altura = 240, referencias = [] }: {
  pontos: { data: string; valor: number; aplicado: number }[];
  altura?: number;
  /** Linhas extras para comparar (CDI, Ibovespa). */
  referencias?: LinhaReferencia[];
}) {
  const { caixa, grafico, cor } = useGrafico(altura);
  // Chave estável: as linhas só são redesenhadas quando os dados mudam de fato.
  const chaveReferencias = referencias.map((r) => `${r.nome}:${r.pontos.length}:${r.pontos[r.pontos.length - 1]?.valor ?? ''}`).join('|');

  useEffect(() => {
    if (!vivo(grafico) || pontos.length < 2 || referencias.length === 0) return;
    const linhas = referencias.filter((r) => r.pontos.length > 1).map((r) => {
      const s = grafico.addLineSeries({ color: cor[r.token], lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: r.nome });
      s.setData(r.pontos.map((p) => ({ time: p.data as Time, value: p.valor })));
      return s;
    });
    return () => removerSeries(grafico, linhas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grafico, pontos, chaveReferencias]);

  useEffect(() => {
    if (!vivo(grafico) || pontos.length < 2) return;
    grafico.applyOptions({
      rightPriceScale: { scaleMargins: { top: 0.12, bottom: 0.05 } },
      localization: { locale: 'pt-BR', priceFormatter: (p: number) => (p / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) },
    });
    const valor = grafico.addAreaSeries({ lineColor: cor.verde, lineWidth: 2, topColor: `${cor.verde}50`, bottomColor: `${cor.verde}00`, priceLineVisible: false });
    valor.setData(pontos.map((p) => ({ time: p.data as Time, value: p.valor })));
    const aplicado = grafico.addLineSeries({ color: cor['tinta-suave'], lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
    aplicado.setData(pontos.map((p) => ({ time: p.data as Time, value: p.aplicado })));
    grafico.timeScale().fitContent();
    return () => removerSeries(grafico, [valor, aplicado]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grafico, pontos]);

  return <motion.div ref={caixa} className="grafico-tv" style={{ height: altura }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} />;
}
