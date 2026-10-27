import type { Centavos } from '../domain/tipos';

/** Formatação do manual de marca, "Números e moeda". */

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MENOS = '−';

/** R$ 1.234,56 (espaço comum depois de R$, sinal de menos tipográfico). */
export function formatarMoeda(c: Centavos): string {
  return moeda.format(Math.abs(c) / 100).replace(/ /g, ' ').replace(/^/, c < 0 ? MENOS : '');
}

export function formatarPercentual(v: number, casas = 2): string {
  const n = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(Math.abs(v));
  return `${v < 0 ? MENOS : ''}${n}%`;
}

/** 13,75% a.a. · 0,52% a.m. */
export function formatarTaxa(v: number, periodo: 'a.a.' | 'a.m.' = 'a.a.'): string {
  return `${formatarPercentual(v)} ${periodo}`;
}

export type Direcao = 'alta' | 'queda' | 'neutra';

export function direcao(v: number): Direcao {
  if (Math.abs(v) < 0.005) return 'neutra';
  return v > 0 ? 'alta' : 'queda';
}

/** ▲ +R$ 32,40 (+1,20%) · ▼ −R$ 18,10 (−0,70%) · — 0,00% */
export function formatarVariacao(valor: Centavos, percentual: number): string {
  const d = direcao(percentual);
  if (d === 'neutra' && valor === 0) return '— 0,00%';
  const seta = d === 'alta' ? '▲' : d === 'queda' ? '▼' : '—';
  const sinal = valor >= 0 ? '+' : MENOS;
  const sinalPct = percentual >= 0 ? '+' : MENOS;
  return `${seta} ${sinal}${formatarMoeda(Math.abs(valor))} (${sinalPct}${decimal2.format(Math.abs(percentual))}%)`;
}

/** Abreviação só para gráficos: R$ 12,3 mil · R$ 1,2 mi. */
export function formatarMoedaCurta(c: Centavos): string {
  const r = c / 100;
  const um = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  if (Math.abs(r) >= 1_000_000) return `R$ ${um.format(r / 1_000_000)} mi`;
  if (Math.abs(r) >= 1_000) return `R$ ${um.format(r / 1_000)} mil`;
  return `R$ ${um.format(r)}`;
}

/** 27/10/2026 a partir de 'AAAA-MM-DD' (sem passar por fuso horário). */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Converte "1.234,56", "1234,56" ou "1234.56" em centavos; null se inválido. */
export function lerMoeda(texto: string): Centavos | null {
  const limpo = texto.replace(/[R$\s]/g, '');
  if (!limpo) return null;
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  if (!/^-?\d+(\.\d{0,2})?$/.test(normalizado)) return null;
  return Math.round(Number(normalizado) * 100);
}

/** Data de hoje em São Paulo, 'AAAA-MM-DD'. */
export function hojeSP(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}
