import { describe, expect, it } from 'vitest';
import type { ResumoClasse } from './carteira';
import { avaliarOportunidades, contextoDoAtivo } from './oportunidades';
import { NOME_CLASSE } from './tipos';

const classe = (c: ResumoClasse['classe'], atual: number, alvo: number | null, valor = 1000): ResumoClasse => ({
  classe: c, aplicado: valor, valorBruto: valor, percentualAtual: atual, percentualAlvo: alvo,
});

/** n pregões consecutivos a partir de uma data, com o preço dado por f(i). */
function serie(n: number, f: (i: number) => number, inicio = '2026-07-01') {
  const d = new Date(`${inicio}T12:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() + i);
    return { data: x.toISOString().slice(0, 10), fechamento: f(i) };
  });
}

describe('contexto do ETF', () => {
  it('calcula a variação de 30 dias e a distância até a média de 50 pregões', () => {
    const s = serie(80, (i) => (i < 60 ? 100 : 90)); // caiu 10% nos últimos 20 dias
    const c = contextoDoAtivo('BOVA11', s);
    expect(c.variacao30d).toBeCloseTo(-10, 5);
    // média dos últimos 50 = (30×100 + 20×90) / 50 = 96 → 90 está 6,25% abaixo
    expect(c.distanciaMedia50).toBeCloseTo(-6.25, 5);
  });

  it('sem histórico suficiente devolve nulo, sem inventar número', () => {
    expect(contextoDoAtivo('IVVB11', serie(10, () => 100))).toEqual({ codigo: 'IVVB11', variacao30d: null, distanciaMedia50: null });
    expect(contextoDoAtivo('IVVB11', [])).toEqual({ codigo: 'IVVB11', variacao30d: null, distanciaMedia50: null });
  });
});

describe('oportunidades pelas regras da pessoa', () => {
  const classes = [
    classe('reserva', 0, null),
    classe('renda_fixa', 56, 50),
    classe('acoes_br', 18, 25),
    classe('exterior', 26, 25),
  ];

  it('lista só o que está abaixo do alvo, do mais distante para o mais perto', () => {
    const o = avaliarOportunidades(classes, {}, NOME_CLASSE);
    expect(o.map((x) => x.classe)).toEqual(['acoes_br']);
    expect(o[0].distancia).toBe(-7);
    expect(o[0].prioridade).toBe('alta');
    expect(o[0].motivos[0]).toMatch(/7,0 pontos abaixo do seu alvo/);
  });

  it('a queda do ETF entra como contexto, nunca como critério', () => {
    const o = avaliarOportunidades(classes, {
      acoes_br: { codigo: 'BOVA11', variacao30d: -8.2, distanciaMedia50: -5 },
      exterior: { codigo: 'IVVB11', variacao30d: -15, distanciaMedia50: -9 }, // caiu, mas está acima do alvo
    }, NOME_CLASSE);
    expect(o.map((x) => x.classe)).toEqual(['acoes_br']);
    expect(o[0].motivos).toHaveLength(3);
    expect(o[0].motivos[1]).toMatch(/BOVA11 caiu 8,2%/);
  });

  it('diferença pequena (até 1 ponto) não vira oportunidade', () => {
    const o = avaliarOportunidades([classe('renda_fixa', 49.5, 50), classe('acoes_br', 25.5, 25), classe('exterior', 25, 25)], {}, NOME_CLASSE);
    expect(o).toHaveLength(0);
  });

  it('carteira vazia não sugere nada', () => {
    expect(avaliarOportunidades([classe('renda_fixa', 0, 50, 0), classe('acoes_br', 0, 25, 0)], {}, NOME_CLASSE)).toEqual([]);
  });
});
