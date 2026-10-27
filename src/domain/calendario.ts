/**
 * Dias úteis com os feriados nacionais (base do mercado: 252 dias úteis por ano).
 * Datas trafegam como 'AAAA-MM-DD' para não depender de fuso horário.
 */

export type DataISO = string;

const doisDigitos = (n: number) => String(n).padStart(2, '0');

export function paraISO(d: Date): DataISO {
  return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`;
}

export function deISO(iso: DataISO): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export function somarDias(iso: DataISO, dias: number): DataISO {
  const d = deISO(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return paraISO(d);
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano: number): DataISO {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

const cacheFeriados = new Map<number, Set<DataISO>>();

export function feriadosNacionais(ano: number): Set<DataISO> {
  const emCache = cacheFeriados.get(ano);
  if (emCache) return emCache;
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];
  // Consciência Negra é feriado nacional desde 2024 (Lei 14.759/2023).
  if (ano >= 2024) fixos.push('11-20');
  const p = pascoa(ano);
  const moveis = [-48, -47, -2, 60].map((d) => somarDias(p, d)); // Carnaval (seg, ter), Sexta Santa, Corpus Christi
  const conjunto = new Set([...fixos.map((md) => `${ano}-${md}`), ...moveis]);
  cacheFeriados.set(ano, conjunto);
  return conjunto;
}

export function ehDiaUtil(iso: DataISO): boolean {
  const d = deISO(iso);
  const semana = d.getUTCDay();
  if (semana === 0 || semana === 6) return false;
  return !feriadosNacionais(d.getUTCFullYear()).has(iso);
}

/** Dias úteis no intervalo [de, ate): conta `de`, não conta `ate`. */
export function diasUteis(de: DataISO, ate: DataISO): number {
  if (ate <= de) return 0;
  let n = 0;
  for (let d = de; d < ate; d = somarDias(d, 1)) if (ehDiaUtil(d)) n++;
  return n;
}

export function diasCorridos(de: DataISO, ate: DataISO): number {
  return Math.round((deISO(ate).getTime() - deISO(de).getTime()) / 86_400_000);
}
