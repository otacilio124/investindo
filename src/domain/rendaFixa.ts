import { diasCorridos, diasUteis, deISO, type DataISO } from './calendario';
import type { Centavos, Indexador } from './tipos';

/** Alíquota de IR da renda fixa pela tabela regressiva, em %. */
export function aliquotaIR(diasCorridosAplicacao: number): number {
  if (diasCorridosAplicacao <= 180) return 22.5;
  if (diasCorridosAplicacao <= 360) return 20;
  if (diasCorridosAplicacao <= 720) return 17.5;
  return 15;
}

/** Juro real pela equação de Fisher: (1 + nominal) / (1 + inflação) − 1, em %. */
export function juroReal(nominalPct: number, inflacaoPct: number): number {
  return ((1 + nominalPct / 100) / (1 + inflacaoPct / 100) - 1) * 100;
}

/* ------------------------------------------------------------------ */
/* Escolha do produto de renda fixa (passo 5a do algoritmo)            */
/* ------------------------------------------------------------------ */

export interface TituloIPCA {
  nome: string;
  vencimento: DataISO;
  /** Taxa real de compra, % a.a. (ex.: 6,8 para IPCA + 6,80%). */
  taxaReal: number;
  /** Preço unitário de compra, em centavos; usado para o mínimo (1% do título, nunca menos de R$ 30). */
  puCompra: Centavos | null;
}

export interface EntradaEscolhaRF {
  hoje: DataISO;
  prazoAnos: number;
  /** Mediana Focus para IPCA dos próximos 12 meses, % a.a. */
  ipcaEsperado: number;
  titulos: TituloIPCA[];
  /** CDB prefixado digitado pelo usuário (taxas de CDB não têm API pública). */
  cdbPre?: { nome: string; taxa: number } | null;
  /** Taxa de custódia da B3 sobre títulos públicos, % a.a. */
  custodiaTesouro?: number;
}

export interface EscolhaRF {
  produto: string;
  tipo: 'tesouro' | 'cdb';
  /** Retorno anual equivalente, líquido de IR e custódia, % a.a. */
  liquidoAnual: number;
  minimo: Centavos;
  motivo: string;
  comparacao: { produto: string; liquidoAnual: number }[];
}

const MINIMO_TESOURO: Centavos = 3000;

function liquidoAnualizado(nominalAnual: number, anos: number, aliquota: number): number {
  const brutoTotal = Math.pow(1 + nominalAnual / 100, anos) - 1;
  const liquidoTotal = brutoTotal * (1 - aliquota / 100);
  return (Math.pow(1 + liquidoTotal, 1 / anos) - 1) * 100;
}

const pct = (v: number) => `${v.toFixed(2).replace('.', ',')}%`;

/** Título IPCA+ com vencimento mais próximo do prazo do usuário. */
export function tituloMaisProximo(titulos: TituloIPCA[], hoje: DataISO, prazoAnos: number): TituloIPCA | null {
  const validos = titulos.filter((t) => t.vencimento > hoje && t.taxaReal > -5 && t.taxaReal < 25);
  if (validos.length === 0) return null;
  const alvo = deISO(hoje).getTime() + prazoAnos * 365.25 * 86_400_000;
  return validos.reduce((melhor, t) =>
    Math.abs(deISO(t.vencimento).getTime() - alvo) < Math.abs(deISO(melhor.vencimento).getTime() - alvo) ? t : melhor,
  );
}

export function escolherRendaFixa(e: EntradaEscolhaRF): EscolhaRF | null {
  const anos = Math.max(0.5, e.prazoAnos);
  const aliquota = aliquotaIR(Math.round(anos * 365));
  const custodia = e.custodiaTesouro ?? 0.2;
  const opcoes: EscolhaRF[] = [];

  const titulo = tituloMaisProximo(e.titulos, e.hoje, anos);
  if (titulo) {
    const nominal = ((1 + titulo.taxaReal / 100) * (1 + e.ipcaEsperado / 100) - 1) * 100 - custodia;
    const minimo = Math.max(MINIMO_TESOURO, titulo.puCompra ? Math.ceil(titulo.puCompra / 100) : 0);
    opcoes.push({
      produto: titulo.nome,
      tipo: 'tesouro',
      liquidoAnual: liquidoAnualizado(nominal, anos, aliquota),
      minimo,
      motivo: `IPCA + ${pct(titulo.taxaReal)} protege da inflação`,
      comparacao: [],
    });
  }
  if (e.cdbPre && e.cdbPre.taxa > 0) {
    opcoes.push({
      produto: e.cdbPre.nome,
      tipo: 'cdb',
      liquidoAnual: liquidoAnualizado(e.cdbPre.taxa, anos, aliquota),
      minimo: 100,
      motivo: `prefixado a ${pct(e.cdbPre.taxa)} a.a.`,
      comparacao: [],
    });
  }
  if (opcoes.length === 0) return null;

  const comparacao = opcoes.map((o) => ({ produto: o.produto, liquidoAnual: o.liquidoAnual }));
  const melhor = opcoes.reduce((a, b) => (b.liquidoAnual > a.liquidoAnual ? b : a));
  const real = juroReal(melhor.liquidoAnual, e.ipcaEsperado);
  return {
    ...melhor,
    comparacao,
    motivo:
      `${melhor.produto}: ${melhor.motivo}. Rende cerca de ${pct(melhor.liquidoAnual)} a.a. ` +
      `depois do IR de ${pct(aliquota)}, ou ${pct(real)} acima da inflação esperada.`,
  };
}

/* ------------------------------------------------------------------ */
/* Quanto vale hoje uma aplicação de renda fixa                        */
/* ------------------------------------------------------------------ */

export interface PontoSerie {
  data: DataISO;
  /** Taxa do dia, em % (série SGS 12 do CDI ou 11 da Selic). */
  valor: number;
}

/**
 * Fator acumulado de um pós-fixado entre [de, ate): multiplica a taxa de cada
 * dia útil publicada pelo Banco Central, aplicando o percentual contratado.
 */
export function fatorPosFixado(serieDiaria: PontoSerie[], de: DataISO, ate: DataISO, percentual: number): number {
  return serieDiaria
    .filter((p) => p.data >= de && p.data < ate)
    .reduce((f, p) => f * (1 + (p.valor / 100) * (percentual / 100)), 1);
}

export function fatorPrefixado(taxaAnual: number, de: DataISO, ate: DataISO): number {
  return Math.pow(1 + taxaAnual / 100, diasUteis(de, ate) / 252);
}

export interface PontoMensal {
  /** Primeiro dia do mês de referência, 'AAAA-MM-01'. */
  mes: DataISO;
  /** IPCA do mês, % (série SGS 433). */
  valor: number;
}

/**
 * IPCA + taxa: acumula o IPCA dos meses completos após a aplicação e a parte real
 * por dias úteis. É uma aproximação da curva (sem a projeção pró-rata do mês corrente).
 */
export function fatorIPCAMais(ipcaMensal: PontoMensal[], taxaReal: number, de: DataISO, ate: DataISO): number {
  const mesInicio = de.slice(0, 7);
  const mesFim = ate.slice(0, 7);
  const inflacao = ipcaMensal
    .filter((p) => p.mes.slice(0, 7) > mesInicio && p.mes.slice(0, 7) < mesFim)
    .reduce((f, p) => f * (1 + p.valor / 100), 1);
  return inflacao * fatorPrefixado(taxaReal, de, ate);
}

export interface DadosMercado {
  cdiDiario: PontoSerie[];
  selicDiaria: PontoSerie[];
  ipcaMensal: PontoMensal[];
}

export interface AplicacaoRF {
  data: DataISO;
  valor: Centavos;
  indexador: Indexador;
  /** pre/ipca: % a.a.; cdi/selic: % do índice (ex.: 100 = 100% do CDI). */
  taxa: number;
}

/** Valor bruto estimado pela curva do papel, do dia da aplicação até `hoje`. */
export function valorNaCurva(a: AplicacaoRF, hoje: DataISO, m: DadosMercado): Centavos {
  let fator = 1;
  switch (a.indexador) {
    case 'pre':
      fator = fatorPrefixado(a.taxa, a.data, hoje);
      break;
    case 'cdi':
      fator = fatorPosFixado(m.cdiDiario, a.data, hoje, a.taxa);
      break;
    case 'selic':
      fator = fatorPosFixado(m.selicDiaria, a.data, hoje, a.taxa || 100);
      break;
    case 'ipca':
      fator = fatorIPCAMais(m.ipcaMensal, a.taxa, a.data, hoje);
      break;
    case 'nenhum':
      fator = 1;
  }
  return Math.round(a.valor * fator);
}

/** IR estimado sobre o ganho, se resgatasse hoje. */
export function irEstimado(aplicado: Centavos, bruto: Centavos, data: DataISO, hoje: DataISO, isento = false): Centavos {
  const ganho = bruto - aplicado;
  if (isento || ganho <= 0) return 0;
  return Math.round((ganho * aliquotaIR(diasCorridos(data, hoje))) / 100);
}
