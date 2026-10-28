import { ehDiaUtil, somarDias, type DataISO } from './calendario';
import type { Ativo, Movimentacao } from './carteira';
import type { Centavos } from './tipos';

/**
 * Ajuda para o Imposto de Renda (pessoa física), sem substituir um contador.
 *
 * ETFs (operações comuns, não day trade):
 * - 15% sobre o lucro das vendas no mês; não há isenção de R$ 20 mil para ETF;
 * - prejuízo de um mês é compensado nos lucros dos meses seguintes;
 * - DARF código 6015, vence no último dia útil do mês seguinte à venda;
 * - DARF abaixo de R$ 10 não é pago: o valor se soma ao do mês seguinte.
 * Renda fixa (Tesouro, CDB): o imposto já é retido pela instituição no resgate.
 */

export const CODIGO_DARF = '6015';
export const ALIQUOTA_ETF = 15;
const DARF_MINIMO: Centavos = 1000;

export interface ApuracaoMes {
  mes: string; // 'AAAA-MM'
  totalVendido: Centavos;
  /** Lucro (+) ou prejuízo (−) das vendas do mês, pelo custo médio. */
  resultado: Centavos;
  prejuizoCompensado: Centavos;
  baseDeCalculo: Centavos;
  impostoDoMes: Centavos;
  /** Imposto de meses anteriores abaixo de R$ 10 que entra neste DARF. */
  acumuladoAnterior: Centavos;
  /** O que vai no DARF deste mês (0 se ficou abaixo de R$ 10 e foi para o próximo). */
  darf: Centavos;
  vencimento: DataISO;
  /** Prejuízo que sobra para compensar depois. */
  prejuizoAcumulado: Centavos;
}

/** Último dia útil do mês seguinte a 'AAAA-MM'. */
export function vencimentoDarf(mes: string): DataISO {
  const [a, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(m === 12 ? a + 1 : a, m === 12 ? 1 : m + 1, 0)).toISOString().slice(0, 10);
  let d = ultimoDia;
  while (!ehDiaUtil(d)) d = somarDias(d, -1);
  return d;
}

export function apurarVendasDeEtf(ativos: Ativo[], movs: Movimentacao[]): ApuracaoMes[] {
  const etfs = new Set(ativos.filter((a) => a.tipo === 'etf').map((a) => a.id));
  const posicao = new Map<string, { qtd: number; custo: number }>();
  const porMes = new Map<string, { vendido: number; resultado: number }>();

  for (const m of [...movs].filter((x) => etfs.has(x.ativoId)).sort((a, b) => a.data.localeCompare(b.data))) {
    const p = posicao.get(m.ativoId) ?? { qtd: 0, custo: 0 };
    const total = m.quantidade * m.precoUnitario;
    if (m.tipo === 'compra') {
      p.qtd += m.quantidade;
      p.custo += total;
    } else {
      const qtd = Math.min(m.quantidade, p.qtd);
      const custoMedio = p.qtd > 0 ? p.custo / p.qtd : 0;
      const custoVenda = custoMedio * qtd;
      const mes = m.data.slice(0, 7);
      const acc = porMes.get(mes) ?? { vendido: 0, resultado: 0 };
      acc.vendido += qtd * m.precoUnitario;
      acc.resultado += qtd * m.precoUnitario - custoVenda;
      porMes.set(mes, acc);
      p.qtd -= qtd;
      p.custo -= custoVenda;
    }
    posicao.set(m.ativoId, p);
  }

  let prejuizo = 0;
  let acumulado = 0;
  const saida: ApuracaoMes[] = [];
  for (const mes of [...porMes.keys()].sort()) {
    const { vendido, resultado } = porMes.get(mes)!;
    const resultadoMes = Math.round(resultado);
    let compensado = 0;
    let base = 0;
    if (resultadoMes < 0) {
      prejuizo += -resultadoMes;
    } else {
      compensado = Math.min(prejuizo, resultadoMes);
      prejuizo -= compensado;
      base = resultadoMes - compensado;
    }
    const impostoDoMes = Math.round((base * ALIQUOTA_ETF) / 100);
    const devido = impostoDoMes + acumulado;
    const darf = devido >= DARF_MINIMO ? devido : 0;
    saida.push({
      mes, totalVendido: Math.round(vendido), resultado: resultadoMes, prejuizoCompensado: compensado,
      baseDeCalculo: base, impostoDoMes, acumuladoAnterior: acumulado, darf,
      vencimento: vencimentoDarf(mes), prejuizoAcumulado: prejuizo,
    });
    acumulado = darf > 0 ? 0 : devido;
  }
  return saida;
}

export interface BemOuDireito {
  ativo: Ativo;
  quantidade: number;
  /** Custo de aquisição (o que se declara), pelo custo médio. */
  custo: Centavos;
}

/** Situação em 31/12 do ano: quantidade e custo de aquisição de cada investimento. */
export function bensEDireitos(ativos: Ativo[], movs: Movimentacao[], ano: number): BemOuDireito[] {
  const limite = `${ano}-12-31`;
  const posicao = new Map<string, { qtd: number; custo: number }>();
  for (const m of [...movs].filter((x) => x.data <= limite).sort((a, b) => a.data.localeCompare(b.data))) {
    const p = posicao.get(m.ativoId) ?? { qtd: 0, custo: 0 };
    if (m.tipo === 'compra') {
      p.qtd += m.quantidade;
      p.custo += m.quantidade * m.precoUnitario;
    } else {
      const qtd = Math.min(m.quantidade, p.qtd);
      const custoMedio = p.qtd > 0 ? p.custo / p.qtd : 0;
      p.qtd -= qtd;
      p.custo -= custoMedio * qtd;
    }
    posicao.set(m.ativoId, p);
  }
  return ativos
    .filter((a) => (posicao.get(a.id)?.qtd ?? 0) > 1e-9)
    .map((a) => ({ ativo: a, quantidade: posicao.get(a.id)!.qtd, custo: Math.round(posicao.get(a.id)!.custo) }))
    .sort((x, y) => x.ativo.classe.localeCompare(y.ativo.classe) || x.ativo.nome.localeCompare(y.ativo.nome));
}
