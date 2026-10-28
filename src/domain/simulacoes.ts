import { ratear } from './rateio';
import type { PontoSerie } from './rendaFixa';
import type { Centavos, ClasseInvestimento } from './tipos';
import type { DataISO } from './calendario';

/* ------------------------------------------------------------------ */
/* Séries de preço                                                     */
/* ------------------------------------------------------------------ */

export interface PontoPreco {
  data: DataISO;
  preco: number;
}

/** Último preço com data ≤ d (busca binária; a série precisa estar ordenada). */
export function precoEm(serie: PontoPreco[], d: DataISO): number | null {
  let lo = 0;
  let hi = serie.length - 1;
  let achado: number | null = null;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    if (serie[meio].data <= d) {
      achado = serie[meio].preco;
      lo = meio + 1;
    } else hi = meio - 1;
  }
  return achado;
}

/**
 * Índice acumulado do CDI: valor de R$ 1 aplicado antes do primeiro dia da
 * série. indice(d) = produto das taxas diárias de todos os dias < d.
 * Fator entre duas datas = indice(fim) / indice(inicio).
 */
export function indiceCDI(serie: PontoSerie[]): (d: DataISO) => number {
  const ordenada = [...serie].sort((a, b) => a.data.localeCompare(b.data));
  const acumulado: { data: DataISO; indice: number }[] = [];
  let i = 1;
  for (const p of ordenada) {
    acumulado.push({ data: p.data, indice: i });
    i *= 1 + p.valor / 100;
  }
  const final = i;
  return (d: DataISO) => {
    // primeiro dia da série com data ≥ d: o índice antes de aplicar esse dia.
    let lo = 0;
    let hi = acumulado.length - 1;
    let res = final;
    while (lo <= hi) {
      const meio = (lo + hi) >> 1;
      if (acumulado[meio].data >= d) {
        res = acumulado[meio].indice;
        hi = meio - 1;
      } else lo = meio + 1;
    }
    return res;
  };
}

/* ------------------------------------------------------------------ */
/* 1. Seu plano no passado                                             */
/* ------------------------------------------------------------------ */

export interface EntradaPlanoPassado {
  aporteMensal: Centavos;
  pesos: Record<ClasseInvestimento, number>;
  /** Fechamentos diários (R$, não centavos) dos ETFs escolhidos. */
  etfAcoes: PontoPreco[];
  etfExterior: PontoPreco[];
  /** Taxa diária do CDI (SGS 12): a renda fixa da simulação rende 100% do CDI. */
  cdiDiario: PontoSerie[];
  /** Primeiro mês da simulação, 'AAAA-MM'. */
  mesInicial: string;
  hoje: DataISO;
}

export interface ResultadoPlanoPassado {
  pontos: { data: DataISO; valor: Centavos; aportado: Centavos }[];
  aportes: number;
  totalAportado: Centavos;
  valorFinal: Centavos;
  rendimento: Centavos;
}

/**
 * Repete o plano mês a mês no passado, com o MESMO motor de rateio do app
 * (classes abaixo do alvo recebem mais, cotas inteiras, sobra na renda fixa),
 * os preços reais de fechamento e o CDI do Banco Central. Sem reserva: mostra
 * só o efeito das regras de investimento.
 */
export function simularPlanoNoPassado(e: EntradaPlanoPassado): ResultadoPlanoPassado {
  const cdi = indiceCDI(e.cdiDiario);
  const acoes = [...e.etfAcoes].sort((a, b) => a.data.localeCompare(b.data));
  const exterior = [...e.etfExterior].sort((a, b) => a.data.localeCompare(b.data));

  // Dia do aporte: o primeiro pregão de cada mês em que os dois ETFs têm preço.
  const diasDeAporte: DataISO[] = [];
  const meses = new Set<string>();
  for (const p of acoes) {
    const mes = p.data.slice(0, 7);
    if (mes < e.mesInicial || meses.has(mes) || p.data > e.hoje) continue;
    if (precoEm(exterior, p.data) === null) continue;
    meses.add(mes);
    diasDeAporte.push(p.data);
  }

  let cotasAcoes = 0;
  let cotasExterior = 0;
  let rf = 0; // centavos, já corrigido até dataRf
  let dataRf: DataISO | null = null;
  let aportado = 0;
  const pontos: ResultadoPlanoPassado['pontos'] = [];

  const corrigirRf = (ate: DataISO) => {
    if (dataRf && rf > 0) rf = Math.round((rf * cdi(ate)) / cdi(dataRf));
    dataRf = ate;
  };
  const valorEm = (d: DataISO) =>
    Math.round(cotasAcoes * (precoEm(acoes, d) ?? 0) * 100) + Math.round(cotasExterior * (precoEm(exterior, d) ?? 0) * 100) + rf;

  for (const d of diasDeAporte) {
    corrigirRf(d);
    const precoA = Math.round((precoEm(acoes, d) ?? 0) * 100);
    const precoX = Math.round((precoEm(exterior, d) ?? 0) * 100);
    const r = ratear({
      aporte: e.aporteMensal,
      caixaPendente: 0,
      reserva: { saldo: 0, meta: 0, produto: 'Reserva' },
      saldos: { renda_fixa: rf, acoes_br: cotasAcoes * precoA, exterior: cotasExterior * precoX },
      pesos: e.pesos,
      etfs: { acoes_br: { codigo: 'A', preco: precoA }, exterior: { codigo: 'X', preco: precoX } },
      rendaFixa: { produto: 'CDI', minimo: 0 },
    });
    for (const i of r.itens) {
      if (i.classe === 'acoes_br') cotasAcoes += i.quantidade ?? 0;
      else if (i.classe === 'exterior') cotasExterior += i.quantidade ?? 0;
      else rf += i.valor;
    }
    aportado += e.aporteMensal;
    pontos.push({ data: d, valor: valorEm(d), aportado });
  }

  if (pontos.length > 0 && pontos[pontos.length - 1].data < e.hoje) {
    corrigirRf(e.hoje);
    pontos.push({ data: e.hoje, valor: valorEm(e.hoje), aportado });
  }
  const valorFinal = pontos.length ? pontos[pontos.length - 1].valor : 0;
  return { pontos, aportes: diasDeAporte.length, totalAportado: aportado, valorFinal, rendimento: valorFinal - aportado };
}

/* ------------------------------------------------------------------ */
/* 2. Comparar com CDI e Ibovespa                                      */
/* ------------------------------------------------------------------ */

export interface Fluxo {
  data: DataISO;
  /** Dinheiro que entrou (+) ou saiu (−) da carteira, em centavos. */
  valor: Centavos;
}

/**
 * Quanto o MESMO dinheiro, nas MESMAS datas, valeria se tivesse ido todo para o
 * CDI ou todo para o Ibovespa. É a comparação justa: mesmos aportes, mesmos dias.
 */
export function compararComReferencias(
  fluxos: Fluxo[],
  datas: DataISO[],
  cdiDiario: PontoSerie[],
  ibov: PontoPreco[],
): { data: DataISO; cdi: Centavos; ibov: Centavos | null }[] {
  const cdi = indiceCDI(cdiDiario);
  const ibovOrd = [...ibov].sort((a, b) => a.data.localeCompare(b.data));
  return datas.map((d) => {
    let valorCdi = 0;
    let valorIbov = 0;
    let ibovOk = ibovOrd.length > 0;
    for (const f of fluxos) {
      if (f.data > d) continue;
      valorCdi += f.valor * (cdi(d) / cdi(f.data));
      const p0 = precoEm(ibovOrd, f.data);
      const p1 = precoEm(ibovOrd, d);
      if (p0 && p1) valorIbov += f.valor * (p1 / p0);
      else ibovOk = false;
    }
    return { data: d, cdi: Math.round(valorCdi), ibov: ibovOk ? Math.round(valorIbov) : null };
  });
}

/* ------------------------------------------------------------------ */
/* 3. Meta com prazo                                                   */
/* ------------------------------------------------------------------ */

/**
 * Aporte mensal para sair de `saldoAtual` e chegar a `objetivo` em `meses`,
 * com juro real anual constante (valores de hoje). 0 se o saldo já basta.
 */
export function aporteMensalNecessario(objetivo: Centavos, saldoAtual: Centavos, meses: number, juroRealAnual: number): Centavos {
  if (meses <= 0) return Math.max(0, objetivo - saldoAtual);
  const r = Math.pow(1 + juroRealAnual / 100, 1 / 12) - 1;
  const crescimento = Math.pow(1 + r, meses);
  const falta = objetivo - saldoAtual * crescimento;
  if (falta <= 0) return 0;
  return Math.ceil(r === 0 ? falta / meses : (falta * r) / (crescimento - 1));
}

export function mesesAte(hoje: DataISO, prazo: DataISO): number {
  const [a1, m1] = hoje.split('-').map(Number);
  const [a2, m2] = prazo.split('-').map(Number);
  return Math.max(0, (a2 - a1) * 12 + (m2 - m1));
}

/* ------------------------------------------------------------------ */
/* 4. Sequência de constância                                          */
/* ------------------------------------------------------------------ */

export interface Sequencia {
  /** Meses seguidos com pelo menos um aporte, até o mês atual (ou o anterior). */
  atual: number;
  recorde: number;
  investiuEsteMes: boolean;
}

const mesAnterior = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
};

export function sequenciaDeMeses(datasDeCompra: DataISO[], hoje: DataISO): Sequencia {
  const meses = new Set(datasDeCompra.map((d) => d.slice(0, 7)));
  const mesAtual = hoje.slice(0, 7);
  const investiuEsteMes = meses.has(mesAtual);

  // O mês atual ainda não acabou: se não investiu ainda, a sequência conta até o mês passado.
  let atual = 0;
  for (let m = investiuEsteMes ? mesAtual : mesAnterior(mesAtual); meses.has(m); m = mesAnterior(m)) atual++;

  let recorde = 0;
  let corrente = 0;
  let anterior: string | null = null;
  for (const m of [...meses].sort()) {
    corrente = anterior && mesAnterior(m) === anterior ? corrente + 1 : 1;
    recorde = Math.max(recorde, corrente);
    anterior = m;
  }
  return { atual, recorde, investiuEsteMes };
}
