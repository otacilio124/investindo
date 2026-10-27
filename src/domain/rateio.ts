import {
  CLASSES_INVESTIMENTO,
  NOME_CLASSE,
  type Centavos,
  type Classe,
  type ClasseInvestimento,
} from './tipos';

export interface EtfDaClasse {
  codigo: string;
  /** Preço da cota em centavos; null quando nenhuma fonte trouxe cotação. */
  preco: Centavos | null;
}

export interface EntradaRateio {
  aporte: Centavos;
  /** Valor que sobrou de meses anteriores por não atingir o mínimo do produto. */
  caixaPendente: Centavos;
  /** `minimo`: menor compra aceita pelo produto da reserva (Tesouro Selic: 1% do título). */
  reserva: { saldo: Centavos; meta: Centavos; produto: string; minimo?: Centavos };
  saldos: Record<ClasseInvestimento, Centavos>;
  /** Percentuais-alvo, somando 100. */
  pesos: Record<ClasseInvestimento, number>;
  etfs: { acoes_br: EtfDaClasse; exterior: EtfDaClasse };
  rendaFixa: { produto: string; minimo: Centavos };
}

export interface ItemRateio {
  classe: Classe;
  produto: string;
  valor: Centavos;
  /** Cotas inteiras a comprar (só ETF); null quando não se aplica ou falta cotação. */
  quantidade: number | null;
  precoReferencia: Centavos | null;
  motivo: string;
}

export interface ResultadoRateio {
  itens: ItemRateio[];
  /** Quanto fica guardado para somar ao aporte do mês seguinte. */
  caixaPendenteNovo: Centavos;
  /** aporte + caixa pendente: tudo que foi distribuído ou guardado. */
  disponivel: Centavos;
  /** Explicação passo a passo, em linguagem do manual de marca. */
  passos: string[];
}

/**
 * Divide `total` centavos proporcionalmente a `pesos` pelo método do maior
 * resto: a soma das partes é sempre exatamente `total`.
 */
export function dividirProporcional(total: Centavos, pesos: number[]): Centavos[] {
  const soma = pesos.reduce((a, p) => a + Math.max(0, p), 0);
  if (total <= 0 || soma <= 0) return pesos.map(() => 0);
  const brutos = pesos.map((p) => (total * Math.max(0, p)) / soma);
  const partes = brutos.map(Math.floor);
  let restante = total - partes.reduce((a, b) => a + b, 0);
  const ordem = brutos
    .map((b, i) => ({ i, frac: b - Math.floor(b) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; restante > 0; k = (k + 1) % ordem.length, restante--) partes[ordem[k].i]++;
  return partes;
}

/** Falta de cada classe para chegar ao alvo após o aporte (nunca negativa). */
export function calcularFaltas(
  saldos: Record<ClasseInvestimento, Centavos>,
  pesos: Record<ClasseInvestimento, number>,
  aporte: Centavos,
): Record<ClasseInvestimento, number> {
  const patrimonio = CLASSES_INVESTIMENTO.reduce((a, c) => a + saldos[c], 0);
  const base = patrimonio + aporte;
  return Object.fromEntries(
    CLASSES_INVESTIMENTO.map((c) => [c, Math.max(0, (base * pesos[c]) / 100 - saldos[c])]),
  ) as Record<ClasseInvestimento, number>;
}

export function validarPesos(pesos: Record<ClasseInvestimento, number>): string | null {
  if (CLASSES_INVESTIMENTO.some((c) => !Number.isFinite(pesos[c]) || pesos[c] < 0)) {
    return 'Os percentuais não podem ser negativos.';
  }
  const soma = CLASSES_INVESTIMENTO.reduce((a, c) => a + pesos[c], 0);
  if (Math.abs(soma - 100) > 0.001) return `Os percentuais somam ${soma}%, precisam somar 100%.`;
  return null;
}

const brl = (c: Centavos) =>
  (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Regras do rateio (docs/DECISOES.md, "Algoritmo"):
 * 1. Reserva primeiro, só até completar a meta; o que passar segue adiante.
 * 2–4. O resto vai para as classes mais abaixo do alvo, proporcional à falta.
 * 6. ETF em cotas inteiras; a sobra vai para a renda fixa do mesmo mês.
 *    A classe que ficou sem cota continua abaixo do alvo e recebe mais no mês seguinte.
 * 7. Renda fixa abaixo do mínimo do produto fica como caixa para o próximo mês.
 */
export function ratear(e: EntradaRateio): ResultadoRateio {
  if (!Number.isInteger(e.aporte) || e.aporte < 0) throw new Error('Aporte inválido.');
  const erroPesos = validarPesos(e.pesos);
  if (erroPesos) throw new Error(erroPesos);

  const passos: string[] = [];
  const itens: ItemRateio[] = [];
  const disponivel = e.aporte + Math.max(0, e.caixaPendente);
  if (e.caixaPendente > 0) {
    passos.push(`Somamos ${brl(e.caixaPendente)} guardados do mês anterior ao aporte.`);
  }

  // 1. Reserva de emergência. Uma falta menor que a menor compra possível do
  // produto (ou que R$ 1) não vira item: não dá para comprar R$ 0,43 de Tesouro.
  const faltaBruta = Math.max(0, e.reserva.meta - e.reserva.saldo);
  const tolerancia = Math.max(e.reserva.minimo ?? 0, 100);
  const faltaReserva = faltaBruta < tolerancia ? 0 : faltaBruta;
  if (faltaBruta > 0 && faltaReserva === 0) {
    passos.push(`Faltam só ${brl(faltaBruta)} na reserva, menos que a compra mínima de ${e.reserva.produto}. Ela conta como completa.`);
  }
  const paraReserva = Math.min(disponivel, faltaReserva);
  if (paraReserva > 0) {
    const abaixoDoMinimo = e.reserva.minimo !== undefined && paraReserva < e.reserva.minimo;
    itens.push({
      classe: 'reserva',
      produto: e.reserva.produto,
      valor: paraReserva,
      quantidade: null,
      precoReferencia: null,
      motivo:
        (paraReserva === faltaReserva
          ? 'Completa a reserva de emergência.'
          : `Faltam ${brl(faltaReserva - paraReserva)} para completar a reserva.`) +
        (abaixoDoMinimo
          ? ` O mínimo de ${e.reserva.produto} hoje é ${brl(e.reserva.minimo!)}: use um CDB de liquidez diária para este valor.`
          : ''),
    });
    passos.push(`Reserva primeiro: ${brl(paraReserva)} vão para ${e.reserva.produto}.`);
  }
  const resto = disponivel - paraReserva;
  if (resto === 0) {
    return { itens, caixaPendenteNovo: 0, disponivel, passos };
  }

  // 2–4. Classes mais abaixo do alvo recebem mais
  const faltas = calcularFaltas(e.saldos, e.pesos, resto);
  const somaFaltas = CLASSES_INVESTIMENTO.reduce((a, c) => a + faltas[c], 0);
  let alocado: Centavos[];
  if (somaFaltas >= resto) {
    alocado = dividirProporcional(resto, CLASSES_INVESTIMENTO.map((c) => faltas[c]));
  } else {
    // Matematicamente não ocorre (a soma das faltas é ≥ aporte), mas protege contra entradas inconsistentes.
    const excedente = dividirProporcional(
      resto - Math.round(somaFaltas),
      CLASSES_INVESTIMENTO.map((c) => e.pesos[c]),
    );
    alocado = CLASSES_INVESTIMENTO.map((c, i) => Math.round(faltas[c]) + excedente[i]);
    const ajuste = resto - alocado.reduce((a, b) => a + b, 0);
    alocado[0] += ajuste;
  }
  const porClasse = Object.fromEntries(
    CLASSES_INVESTIMENTO.map((c, i) => [c, alocado[i]]),
  ) as Record<ClasseInvestimento, Centavos>;
  passos.push(
    `${brl(resto)} divididos pelas classes mais abaixo do alvo: ` +
      CLASSES_INVESTIMENTO.map((c) => `${NOME_CLASSE[c]} ${brl(porClasse[c])}`).join(', ') +
      '.',
  );

  // 6. Cotas inteiras de ETF
  let rendaFixa = porClasse.renda_fixa;
  for (const classe of ['acoes_br', 'exterior'] as const) {
    const valor = porClasse[classe];
    if (valor <= 0) continue;
    const etf = e.etfs[classe];
    if (etf.preco === null || etf.preco <= 0) {
      itens.push({
        classe,
        produto: etf.codigo,
        valor,
        quantidade: null,
        precoReferencia: null,
        motivo: 'Sem cotação agora: confira o preço no app da corretora antes de comprar.',
      });
      passos.push(`${etf.codigo} está sem cotação; mostramos só o valor.`);
      continue;
    }
    const cotas = Math.floor(valor / etf.preco);
    const gasto = cotas * etf.preco;
    const sobra = valor - gasto;
    rendaFixa += sobra;
    if (cotas > 0) {
      itens.push({
        classe,
        produto: etf.codigo,
        valor: gasto,
        quantidade: cotas,
        precoReferencia: etf.preco,
        motivo: `${cotas} ${cotas === 1 ? 'cota' : 'cotas'} a ${brl(etf.preco)}.`,
      });
    }
    if (sobra > 0) {
      passos.push(
        cotas > 0
          ? `${brl(sobra)} não fecham uma cota de ${etf.codigo} e vão para a renda fixa.`
          : `${brl(valor)} não pagam uma cota de ${etf.codigo} (${brl(etf.preco)}). O valor vai para a renda fixa e ${NOME_CLASSE[classe]} recebe mais no próximo mês.`,
      );
    }
  }

  // 7. Mínimo da renda fixa
  let caixaPendenteNovo: Centavos = 0;
  if (rendaFixa > 0 && rendaFixa < e.rendaFixa.minimo) {
    caixaPendenteNovo = rendaFixa;
    passos.push(
      `${brl(rendaFixa)} ficam guardados para o próximo mês: o mínimo de ${e.rendaFixa.produto} é ${brl(e.rendaFixa.minimo)}.`,
    );
    rendaFixa = 0;
  }
  if (rendaFixa > 0) {
    itens.push({
      classe: 'renda_fixa',
      produto: e.rendaFixa.produto,
      valor: rendaFixa,
      quantidade: null,
      precoReferencia: null,
      motivo: 'Classe abaixo do alvo e sobras das cotas.',
    });
  }

  const ordem: Classe[] = ['reserva', 'renda_fixa', 'acoes_br', 'exterior'];
  itens.sort((a, b) => ordem.indexOf(a.classe) - ordem.indexOf(b.classe));
  return { itens, caixaPendenteNovo, disponivel, passos };
}
