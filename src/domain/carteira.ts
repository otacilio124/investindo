import type { DataISO } from './calendario';
import { aliquotaIR, irEstimado, valorNaCurva, type DadosMercado } from './rendaFixa';
import {
  CLASSES_INVESTIMENTO,
  type Centavos,
  type Classe,
  type ClasseInvestimento,
  type Indexador,
  type TipoAtivo,
} from './tipos';

export interface Ativo {
  id: string;
  codigo: string;
  nome: string;
  classe: Classe;
  tipo: TipoAtivo;
  indexador: Indexador;
  vencimento: DataISO | null;
  isentoIR: boolean;
  /** Banco ou corretora onde o investimento está (ativos próprios). */
  emissor?: string | null;
}

export interface Movimentacao {
  id: string;
  ativoId: string;
  tipo: 'compra' | 'venda';
  data: DataISO;
  quantidade: number;
  /** Preço por unidade, em centavos. Para CDB/LCI use quantidade 1 e o valor aplicado aqui. */
  precoUnitario: Centavos;
  /** pre/ipca: % a.a.; cdi/selic: % do índice. */
  taxaContratada: number | null;
}

/** Saldo bruto copiado do extrato do banco: a fonte mais confiável para CDB e afins. */
export interface SaldoExtrato {
  ativoId: string;
  data: DataISO;
  valorBruto: Centavos;
}

export interface PrecoMercado {
  preco: Centavos;
  data: DataISO;
  fonte: string;
}

/**
 * Como chegamos ao valor de hoje, do mais para o menos confiável:
 * mercado (cotação do ETF ou preço de resgate do Tesouro), extrato (saldo digitado
 * e corrigido pela curva desde então), curva (calculada com CDI/IPCA do Banco
 * Central) ou custo (sem dado nenhum: mostra o que foi aplicado).
 */
export type MetodoValor = 'mercado' | 'extrato' | 'curva' | 'custo';

export const DESCRICAO_METODO: Record<MetodoValor, string> = {
  mercado: 'Preço de mercado',
  extrato: 'Saldo do extrato, corrigido',
  curva: 'Calculado pela taxa contratada',
  custo: 'Valor aplicado (sem dado de mercado)',
};

export interface Posicao {
  ativo: Ativo;
  quantidade: number;
  /** Custo do que ainda está investido (custo médio). */
  aplicado: Centavos;
  valorBruto: Centavos;
  irEstimado: Centavos;
  metodo: MetodoValor;
  dataReferencia: DataISO;
}

interface Lote {
  data: DataISO;
  quantidade: number;
  custo: Centavos;
  taxa: number | null;
}

/** Lotes ainda investidos, abatendo vendas pelo custo médio. */
function lotesAbertos(movs: Movimentacao[]): Lote[] {
  const lotes: Lote[] = [];
  for (const m of [...movs].sort((a, b) => a.data.localeCompare(b.data))) {
    if (m.tipo === 'compra') {
      lotes.push({ data: m.data, quantidade: m.quantidade, custo: Math.round(m.quantidade * m.precoUnitario), taxa: m.taxaContratada });
      continue;
    }
    const total = lotes.reduce((a, l) => a + l.quantidade, 0);
    if (total <= 0) continue;
    const fracaoMantida = Math.max(0, (total - m.quantidade) / total);
    for (const l of lotes) {
      l.quantidade *= fracaoMantida;
      l.custo = Math.round(l.custo * fracaoMantida);
    }
  }
  return lotes.filter((l) => l.quantidade > 1e-9);
}

export function avaliarPosicao(
  ativo: Ativo,
  movs: Movimentacao[],
  extratos: SaldoExtrato[],
  preco: PrecoMercado | undefined,
  mercado: DadosMercado,
  hoje: DataISO,
): Posicao {
  const lotes = lotesAbertos(movs.filter((m) => m.ativoId === ativo.id));
  const quantidade = lotes.reduce((a, l) => a + l.quantidade, 0);
  const aplicado = lotes.reduce((a, l) => a + l.custo, 0);
  const primeiraData = lotes[0]?.data ?? hoje;
  const base = { ativo, quantidade, aplicado };
  const ir = (bruto: Centavos) =>
    ativo.tipo === 'etf'
      ? Math.max(0, Math.round(((bruto - aplicado) * 15) / 100))
      : irEstimado(aplicado, bruto, primeiraData, hoje, ativo.isentoIR);

  if (quantidade <= 0) {
    return { ...base, valorBruto: 0, irEstimado: 0, metodo: 'custo', dataReferencia: hoje };
  }

  // 1. Mercado: ETF e Tesouro têm preço público diário.
  if (preco && preco.preco > 0 && (ativo.tipo === 'etf' || ativo.tipo === 'tesouro')) {
    const bruto = Math.round(quantidade * preco.preco);
    return { ...base, valorBruto: bruto, irEstimado: ir(bruto), metodo: 'mercado', dataReferencia: preco.data };
  }

  const taxaMedia =
    lotes.reduce((a, l) => a + (l.taxa ?? 0) * l.custo, 0) / Math.max(1, aplicado) ||
    (ativo.indexador === 'cdi' || ativo.indexador === 'selic' ? 100 : 0);
  const ultimaMov = movs.filter((m) => m.ativoId === ativo.id).reduce((a, m) => (m.data > a ? m.data : a), '');

  // 2. Extrato mais recente que a última movimentação, corrigido até hoje.
  const extrato = extratos
    .filter((x) => x.ativoId === ativo.id && x.data >= ultimaMov)
    .sort((a, b) => b.data.localeCompare(a.data))[0];
  if (extrato) {
    const bruto = valorNaCurva({ data: extrato.data, valor: extrato.valorBruto, indexador: ativo.indexador, taxa: taxaMedia }, hoje, mercado);
    return { ...base, valorBruto: bruto, irEstimado: ir(bruto), metodo: 'extrato', dataReferencia: extrato.data };
  }

  // 3. Curva da taxa contratada, lote a lote.
  const temTaxa = ativo.indexador !== 'nenhum' && lotes.every((l) => l.taxa !== null || ativo.indexador === 'selic');
  if (temTaxa) {
    const bruto = lotes.reduce(
      (a, l) => a + valorNaCurva({ data: l.data, valor: l.custo, indexador: ativo.indexador, taxa: l.taxa ?? 100 }, hoje, mercado),
      0,
    );
    const ultimoDado = ultimaDataDisponivel(ativo.indexador, mercado) ?? hoje;
    return { ...base, valorBruto: bruto, irEstimado: ir(bruto), metodo: 'curva', dataReferencia: ultimoDado };
  }

  // 4. Sem dado: mostra o custo.
  return { ...base, valorBruto: aplicado, irEstimado: 0, metodo: 'custo', dataReferencia: hoje };
}

function ultimaDataDisponivel(indexador: Indexador, m: DadosMercado): DataISO | null {
  const serie = indexador === 'cdi' ? m.cdiDiario : indexador === 'selic' ? m.selicDiaria : null;
  if (serie?.length) return serie[serie.length - 1].data;
  if (indexador === 'ipca' && m.ipcaMensal.length) return m.ipcaMensal[m.ipcaMensal.length - 1].mes;
  return null;
}

export interface ResumoClasse {
  classe: Classe;
  aplicado: Centavos;
  valorBruto: Centavos;
  /** Participação na carteira investida (sem a reserva), em %. */
  percentualAtual: number;
  percentualAlvo: number | null;
}

export function resumirPorClasse(
  posicoes: Posicao[],
  pesos: Record<ClasseInvestimento, number>,
): { classes: ResumoClasse[]; totalInvestido: Centavos; totalReserva: Centavos; totalAplicado: Centavos; total: Centavos } {
  const soma = (c: Classe, campo: 'aplicado' | 'valorBruto') =>
    posicoes.filter((p) => p.ativo.classe === c).reduce((a, p) => a + p[campo], 0);
  const totalInvestido = CLASSES_INVESTIMENTO.reduce((a, c) => a + soma(c, 'valorBruto'), 0);
  const classes: ResumoClasse[] = (['reserva', ...CLASSES_INVESTIMENTO] as Classe[]).map((c) => ({
    classe: c,
    aplicado: soma(c, 'aplicado'),
    valorBruto: soma(c, 'valorBruto'),
    percentualAtual: c === 'reserva' || totalInvestido === 0 ? 0 : (soma(c, 'valorBruto') / totalInvestido) * 100,
    percentualAlvo: c === 'reserva' ? null : pesos[c],
  }));
  const totalReserva = soma('reserva', 'valorBruto');
  return {
    classes,
    totalInvestido,
    totalReserva,
    totalAplicado: posicoes.reduce((a, p) => a + p.aplicado, 0),
    total: totalInvestido + totalReserva,
  };
}

/** Classes que se afastaram mais de `limite` pontos do alvo (alerta de desvio). */
export function classesDesviadas(classes: ResumoClasse[], limite = 5): ResumoClasse[] {
  return classes.filter((c) => c.percentualAlvo !== null && Math.abs(c.percentualAtual - c.percentualAlvo) > limite);
}

export interface PontoPatrimonio {
  data: DataISO;
  valor: Centavos;
  aplicado: Centavos;
}

/**
 * Patrimônio dia a dia nos últimos `dias` pregões: cada ativo avaliado com o
 * preço de fechamento daquela data (ou o último antes dela, até 7 dias), e na
 * falta de preço pela curva/custo, como na carteira de hoje.
 */
export function serieDePatrimonio(
  ativos: Ativo[],
  movs: Movimentacao[],
  extratos: SaldoExtrato[],
  fechamentos: Record<string, { data: DataISO; preco: Centavos }[]>,
  mercado: DadosMercado,
  hoje: DataISO,
  dias = 365,
): PontoPatrimonio[] {
  if (movs.length === 0) return [];
  const primeira = movs.reduce((a, m) => (m.data < a ? m.data : a), hoje);
  const inicio = primeira > somarDiasISO(hoje, -dias) ? primeira : somarDiasISO(hoje, -dias);
  const comMovimento = ativos.filter((a) => movs.some((m) => m.ativoId === a.id));
  const pontos: PontoPatrimonio[] = [];

  for (let d = inicio; d <= hoje; d = somarDiasISO(d, 1)) {
    const semana = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (d !== hoje && (semana === 0 || semana === 6)) continue;
    const movsAte = movs.filter((m) => m.data <= d);
    const extratosAte = extratos.filter((x) => x.data <= d);
    let valor = 0;
    let aplicado = 0;
    for (const a of comMovimento) {
      if (!movsAte.some((m) => m.ativoId === a.id)) continue;
      const serie = fechamentos[a.codigo];
      const p = serie ? ultimoAte(serie, d) : undefined;
      const preco = p && p.data >= somarDiasISO(d, -7) ? { preco: p.preco, data: p.data, fonte: 'histórico' } : undefined;
      const pos = avaliarPosicao(a, movsAte, extratosAte, preco, mercado, d);
      valor += pos.valorBruto;
      aplicado += pos.aplicado;
    }
    pontos.push({ data: d, valor, aplicado });
  }
  return pontos;
}

function ultimoAte<T extends { data: DataISO }>(serie: T[], d: DataISO): T | undefined {
  let lo = 0;
  let hi = serie.length - 1;
  let achado: T | undefined;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    if (serie[meio].data <= d) {
      achado = serie[meio];
      lo = meio + 1;
    } else hi = meio - 1;
  }
  return achado;
}

function somarDiasISO(iso: DataISO, n: number): DataISO {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export { aliquotaIR };

export interface AportesDoMes {
  /** "2026-10" */
  mes: string;
  porClasse: Record<Classe, Centavos>;
  total: Centavos;
}

/**
 * Quanto entrou em cada classe nos últimos `meses` meses (só compras, pelo
 * preço pago), para o histórico de aportes. Meses sem compra aparecem zerados,
 * assim a constância fica visível.
 */
export function aportesPorMes(movs: Movimentacao[], ativos: Ativo[], hoje: DataISO, meses = 12): AportesDoMes[] {
  const classeDe = new Map(ativos.map((a) => [a.id, a.classe]));
  const [ano, mes] = hoje.split('-').map(Number);
  const saida: AportesDoMes[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    saida.push({ mes: d.toISOString().slice(0, 7), porClasse: { reserva: 0, renda_fixa: 0, acoes_br: 0, exterior: 0 }, total: 0 });
  }
  const porMes = new Map(saida.map((m) => [m.mes, m]));
  for (const m of movs) {
    const alvo = porMes.get(m.data.slice(0, 7));
    const classe = classeDe.get(m.ativoId);
    if (!alvo || !classe || m.tipo !== 'compra') continue;
    const valor = Math.round(m.quantidade * m.precoUnitario);
    alvo.porClasse[classe] += valor;
    alvo.total += valor;
  }
  return saida;
}
