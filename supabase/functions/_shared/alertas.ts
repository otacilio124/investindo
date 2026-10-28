// Regras dos alertas diários, sem rede nem banco (testadas no Vitest).
// A função "alertas" junta os dados de cada pessoa e chama alertasDoDia.

export type ClasseAlerta = 'reserva' | 'renda_fixa' | 'acoes_br' | 'exterior';

export interface AtivoAlerta {
  id: string;
  codigo: string;
  nome: string;
  classe: ClasseAlerta;
  tipo: string;
  vencimento: string | null;
}

export interface MovAlerta {
  ativoId: string;
  tipo: 'compra' | 'venda';
  data: string;
  quantidade: number;
  valorTotal: number;
}

export interface PosicaoAlerta {
  ativo: AtivoAlerta;
  quantidade: number;
  /** Em reais. */
  valor: number;
}

export interface Alerta {
  chave: string;
  titulo: string;
  corpo: string;
  /** Tela do app que o toque na notificação abre. */
  url: string;
}

export interface EntradaAlertas {
  hoje: string;
  diaAporte: number;
  aporteConfirmadoNoMes: boolean;
  pesos: Record<Exclude<ClasseAlerta, 'reserva'>, number>;
  posicoes: PosicaoAlerta[];
}

const NOME_CLASSE: Record<ClasseAlerta, string> = {
  reserva: 'Reserva',
  renda_fixa: 'Renda fixa',
  acoes_br: 'Ações Brasil',
  exterior: 'Exterior',
};

/** Abaixo disso a carteira é pequena demais para o percentual dizer algo. */
export const MINIMO_PARA_DESVIO = 500;
export const LIMITE_DESVIO = 5;
export const DIAS_AVISO_VENCIMENTO = 7;

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const dataBR = (iso: string) => iso.split('-').reverse().join('/');
const pct = (n: number) => `${Math.round(n)}%`;

/**
 * Valor de cada ativo hoje, de forma simples: preço de mercado para ETF e
 * Tesouro; para o resto, o saldo do extrato mais recente (se for posterior à
 * última movimentação) ou o valor aplicado. A tela Carteira faz a conta
 * completa, com a curva de cada título; para um alerta de desvio isto basta.
 */
export function posicoesAtuais(
  ativos: AtivoAlerta[],
  movs: MovAlerta[],
  precos: Record<string, number>,
  extratos: Record<string, { data: string; valor: number }>,
): PosicaoAlerta[] {
  const saida: PosicaoAlerta[] = [];
  for (const ativo of ativos) {
    const doAtivo = movs.filter((m) => m.ativoId === ativo.id).sort((a, b) => a.data.localeCompare(b.data));
    if (!doAtivo.length) continue;
    let quantidade = 0;
    let custo = 0;
    for (const m of doAtivo) {
      if (m.tipo === 'compra') {
        quantidade += m.quantidade;
        custo += m.valorTotal;
      } else if (quantidade > 0) {
        const mantida = Math.max(0, (quantidade - m.quantidade) / quantidade);
        quantidade *= mantida;
        custo *= mantida;
      }
    }
    if (quantidade <= 1e-9) continue;
    const ultimaMov = doAtivo[doAtivo.length - 1].data;
    const preco = precos[ativo.codigo];
    const extrato = extratos[ativo.id];
    const valor =
      preco && (ativo.tipo === 'etf' || ativo.tipo === 'tesouro')
        ? quantidade * preco
        : extrato && extrato.data >= ultimaMov
          ? extrato.valor
          : custo;
    saida.push({ ativo, quantidade, valor });
  }
  return saida;
}

export function alertasDoDia(e: EntradaAlertas): Alerta[] {
  const alertas: Alerta[] = [];
  const mes = e.hoje.slice(0, 7);
  const dia = Number(e.hoje.slice(8, 10));

  // 1. Dia do aporte (ou o primeiro dia depois dele, se o anterior falhou).
  if (dia >= e.diaAporte && !e.aporteConfirmadoNoMes) {
    alertas.push({
      chave: `aporte:${mes}`,
      titulo: 'Hora de investir',
      corpo: 'Chegou o dia do seu aporte. Digite o valor e veja o rateio do mês.',
      url: '/investir',
    });
  }

  // 2. Classes a mais de 5 pontos do alvo (um aviso por mês, com todas juntas).
  const investido = e.posicoes.filter((p) => p.ativo.classe !== 'reserva');
  const total = investido.reduce((a, p) => a + p.valor, 0);
  if (total >= MINIMO_PARA_DESVIO) {
    const desvios = (Object.keys(e.pesos) as (keyof EntradaAlertas['pesos'])[])
      .map((c) => {
        const atual = (investido.filter((p) => p.ativo.classe === c).reduce((a, p) => a + p.valor, 0) / total) * 100;
        return { c, atual, alvo: e.pesos[c] };
      })
      .filter((d) => Math.abs(d.atual - d.alvo) > LIMITE_DESVIO);
    if (desvios.length) {
      const lista = desvios.map((d) => `${NOME_CLASSE[d.c]} está em ${pct(d.atual)} (alvo ${pct(d.alvo)})`).join('; ');
      alertas.push({
        chave: `desvio:${mes}`,
        titulo: 'Sua carteira saiu do alvo',
        corpo: `${lista}. O próximo aporte vai primeiro para o que está abaixo do alvo, sem precisar vender nada.`,
        url: '/carteira',
      });
    }
  }

  // 3. Títulos que vencem nos próximos 7 dias.
  for (const p of e.posicoes) {
    const v = p.ativo.vencimento;
    if (!v) continue;
    const faltam = diasEntre(e.hoje, v);
    if (faltam < 0 || faltam > DIAS_AVISO_VENCIMENTO) continue;
    const quando = faltam === 0 ? 'vence hoje' : faltam === 1 ? 'vence amanhã' : `vence em ${faltam} dias (${dataBR(v)})`;
    alertas.push({
      chave: `vencimento:${p.ativo.id}:${v}`,
      titulo: `${p.ativo.nome} ${quando}`,
      corpo: 'O dinheiro cai na conta da corretora. Registre o resgate na Carteira e decida onde reinvestir.',
      url: '/carteira',
    });
  }

  return alertas;
}
