import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { SUAVE } from './movimento';

/** Gráficos leves em SVG (sem a biblioteca de candles), usados na tela inicial. */

/* ------------------------------------------------------------------ */
/* Minigráfico (sparkline) com traço que se desenha                    */
/* ------------------------------------------------------------------ */

export function Sparkline({ valores, largura = 112, altura = 36, cor, area = true }: {
  valores: number[]; largura?: number; altura?: number; cor?: string; area?: boolean;
}) {
  const id = useMemo(() => `sp-${Math.random().toString(36).slice(2, 9)}`, []);
  if (valores.length < 2) return <svg className="sparkline" width={largura} height={altura} aria-hidden />;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const faixa = max - min || 1;
  const pontos = valores.map((v, i) => [(i / (valores.length - 1)) * largura, altura - 3 - ((v - min) / faixa) * (altura - 6)]);
  const linha = pontos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const subiu = valores[valores.length - 1] >= valores[0];
  const traco = cor ?? (subiu ? 'var(--verde)' : 'var(--negativo)');
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none" aria-hidden className="sparkline">
      {area && (
        <>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" style={{ stopColor: traco, stopOpacity: 0.28 }} />
              <stop offset="100%" style={{ stopColor: traco, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <motion.path d={`${linha} L${largura},${altura} L0,${altura} Z`} fill={`url(#${id})`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.3 }} />
        </>
      )}
      <motion.path d={linha} fill="none" style={{ stroke: traco }} strokeWidth={1.75} strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: SUAVE }} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Barra de alocação segmentada (atual por classe)                     */
/* ------------------------------------------------------------------ */

export function BarraAlocacao({ partes }: { partes: { rotulo: string; valor: number; cor: string }[] }) {
  const total = partes.reduce((a, p) => a + p.valor, 0);
  if (total <= 0) return null;
  return (
    <div className="pilha-curta">
      <div className="barra-alocacao" role="img" aria-label={partes.map((p) => `${p.rotulo} ${((p.valor / total) * 100).toFixed(0)}%`).join(', ')}>
        {partes.filter((p) => p.valor > 0).map((p, i) => (
          <motion.span key={p.rotulo} style={{ background: p.cor }}
            initial={{ width: 0 }} animate={{ width: `${(p.valor / total) * 100}%` }}
            transition={{ duration: 0.9, delay: 0.15 + i * 0.08, ease: SUAVE }} />
        ))}
      </div>
      <div className="legenda-alocacao">
        {partes.filter((p) => p.valor > 0).map((p) => (
          <span key={p.rotulo}><i style={{ background: p.cor }} />{p.rotulo} <b>{((p.valor / total) * 100).toFixed(0)}%</b></span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Histórico de aportes: barras empilhadas por classe, mês a mês        */
/* ------------------------------------------------------------------ */

export interface BarraMes {
  rotulo: string;
  rotuloLongo: string;
  partes: { rotulo: string; valor: number; cor: string }[];
}

export function GraficoAportes({ meses, formatar, altura = 180 }: { meses: BarraMes[]; formatar: (v: number) => string; altura?: number }) {
  const total = (m: BarraMes) => m.partes.reduce((a, p) => a + p.valor, 0);
  const maior = Math.max(1, ...meses.map(total));
  const comAporte = meses.filter((m) => total(m) > 0).length;
  return (
    <figure className="grafico-aportes" style={{ margin: 0 }}>
      <div className="grafico-aportes-barras" style={{ height: altura }} aria-hidden>
        {meses.map((m, i) => {
          const t = total(m);
          return (
            <div key={m.rotuloLongo} className="grafico-aportes-coluna" title={`${m.rotuloLongo}: ${formatar(t)}`}>
              <motion.div className="grafico-aportes-pilha" data-vazio={t === 0}
                initial={{ height: 0 }} animate={{ height: t === 0 ? 3 : `${(t / maior) * 100}%` }}
                transition={{ duration: 0.7, delay: 0.04 * i, ease: SUAVE }}>
                {m.partes.filter((p) => p.valor > 0).map((p) => (
                  <span key={p.rotulo} style={{ background: p.cor, flexGrow: p.valor }} />
                ))}
              </motion.div>
              <span className="grafico-aportes-mes">{m.rotulo}</span>
            </div>
          );
        })}
      </div>
      <figcaption className="nota">
        Aportes em {comAporte} dos últimos {meses.length} meses.
      </figcaption>
      <table className="visualmente-oculto">
        <caption>Aportes por mês</caption>
        <thead><tr><th>Mês</th><th>Total</th>{meses[0]?.partes.map((p) => <th key={p.rotulo}>{p.rotulo}</th>)}</tr></thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.rotuloLongo}><td>{m.rotuloLongo}</td><td>{formatar(total(m))}</td>{m.partes.map((p) => <td key={p.rotulo}>{formatar(p.valor)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
