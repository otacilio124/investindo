import type { ResumoClasse } from './carteira';
import type { ClasseInvestimento } from './tipos';

/**
 * "Onde o próximo real rende mais, pelas SUAS regras."
 *
 * Não é previsão de mercado: o critério é só a distância de cada classe até o
 * alvo que a pessoa definiu. A queda recente do ETF e a distância até a média
 * de 50 pregões entram como contexto (informação), nunca como sinal de compra.
 */

export interface ContextoAtivo {
  codigo: string;
  /** Variação do fechamento nos últimos ~30 dias, em %. */
  variacao30d: number | null;
  /** Distância do último fechamento até a média dos últimos 50 pregões, em %. */
  distanciaMedia50: number | null;
}

export interface Oportunidade {
  classe: ClasseInvestimento;
  atual: number;
  alvo: number;
  /** atual − alvo, em pontos percentuais (negativo = abaixo do alvo). */
  distancia: number;
  prioridade: 'alta' | 'media';
  ativo: ContextoAtivo | null;
  /** Frases curtas em linguagem simples, na ordem de importância. */
  motivos: string[];
}

/** Abaixo disso a classe está "no alvo" e não vira oportunidade. */
export const TOLERANCIA_PONTOS = 1;
/** Mais longe que isso do alvo, a oportunidade é de prioridade alta. */
export const PONTOS_PRIORIDADE_ALTA = 5;

const um = (v: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function contextoDoAtivo(codigo: string, fechamentos: { data: string; fechamento: number }[]): ContextoAtivo {
  const s = [...fechamentos].sort((a, b) => a.data.localeCompare(b.data));
  const ultimo = s[s.length - 1];
  if (!ultimo) return { codigo, variacao30d: null, distanciaMedia50: null };

  // Fechamento de ~30 dias corridos atrás (o último pregão até essa data).
  const limite = new Date(`${ultimo.data}T12:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() - 30);
  const corte = limite.toISOString().slice(0, 10);
  const antes = [...s].reverse().find((p) => p.data <= corte);
  const variacao30d = antes ? ((ultimo.fechamento - antes.fechamento) / antes.fechamento) * 100 : null;

  const ultimos50 = s.slice(-50);
  const media = ultimos50.length === 50 ? ultimos50.reduce((a, p) => a + p.fechamento, 0) / 50 : null;
  const distanciaMedia50 = media ? ((ultimo.fechamento - media) / media) * 100 : null;

  return { codigo, variacao30d, distanciaMedia50 };
}

export function avaliarOportunidades(
  classes: ResumoClasse[],
  contexto: Partial<Record<ClasseInvestimento, ContextoAtivo>>,
  nomes: Record<ClasseInvestimento, string>,
): Oportunidade[] {
  const investido = classes.filter((c) => c.percentualAlvo !== null);
  if (investido.every((c) => c.valorBruto === 0)) return [];

  return investido
    .map((c) => {
      const classe = c.classe as ClasseInvestimento;
      const alvo = c.percentualAlvo ?? 0;
      const distancia = c.percentualAtual - alvo;
      const ativo = contexto[classe] ?? null;
      const motivos = [`${nomes[classe]} está ${um(distancia)} pontos abaixo do seu alvo (${um(c.percentualAtual)}% de ${um(alvo)}%).`];
      if (ativo?.variacao30d != null && ativo.variacao30d <= -3) {
        motivos.push(`${ativo.codigo} caiu ${um(ativo.variacao30d)}% nos últimos 30 dias: cada real compra mais cotas que um mês atrás.`);
      }
      if (ativo?.distanciaMedia50 != null && ativo.distanciaMedia50 <= -2) {
        motivos.push(`O preço está ${um(ativo.distanciaMedia50)}% abaixo da média dos últimos 50 pregões.`);
      }
      return {
        classe, atual: c.percentualAtual, alvo, distancia, ativo, motivos,
        prioridade: distancia <= -PONTOS_PRIORIDADE_ALTA ? 'alta' : 'media',
      } satisfies Oportunidade;
    })
    .filter((o) => o.distancia < -TOLERANCIA_PONTOS)
    .sort((a, b) => a.distancia - b.distancia);
}
