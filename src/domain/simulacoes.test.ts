import { describe, expect, it } from 'vitest';
import type { Ativo, Movimentacao } from './carteira';
import { apurarVendasDeEtf, bensEDireitos, vencimentoDarf } from './impostoRenda';
import {
  aporteMensalNecessario,
  compararComReferencias,
  indiceCDI,
  mesesAte,
  precoEm,
  sequenciaDeMeses,
  simularPlanoNoPassado,
} from './simulacoes';

/** Pregões diários (sem fins de semana) entre duas datas, com preço f(i). */
function pregoes(de: string, ate: string, f: (i: number) => number) {
  const s: { data: string; preco: number }[] = [];
  for (let d = new Date(`${de}T12:00:00Z`), i = 0; d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) {
    const dia = d.getUTCDay();
    if (dia === 0 || dia === 6) continue;
    s.push({ data: d.toISOString().slice(0, 10), preco: f(i++) });
  }
  return s;
}

describe('séries e índices', () => {
  it('preço do último pregão até a data', () => {
    const s = [{ data: '2026-01-02', preco: 10 }, { data: '2026-01-05', preco: 11 }];
    expect(precoEm(s, '2026-01-04')).toBe(10);
    expect(precoEm(s, '2026-01-05')).toBe(11);
    expect(precoEm(s, '2026-01-01')).toBeNull();
  });

  it('índice do CDI multiplica as taxas entre as datas', () => {
    const i = indiceCDI([{ data: '2026-01-02', valor: 0.05 }, { data: '2026-01-05', valor: 0.05 }]);
    expect(i('2026-01-06') / i('2026-01-02')).toBeCloseTo(1.0005 ** 2, 10);
    expect(i('2026-01-05') / i('2026-01-02')).toBeCloseTo(1.0005, 10);
  });
});

describe('seu plano no passado', () => {
  const precosPlanos = pregoes('2026-01-01', '2026-06-30', () => 100);
  const base = {
    aporteMensal: 100000, // R$ 1.000
    pesos: { renda_fixa: 50, acoes_br: 25, exterior: 25 },
    etfAcoes: precosPlanos,
    etfExterior: precosPlanos,
    cdiDiario: [] as { data: string; valor: number }[],
    mesInicial: '2026-01',
    hoje: '2026-06-30',
  };

  it('com preços parados e CDI zero, termina com exatamente o que aportou', () => {
    const r = simularPlanoNoPassado(base);
    expect(r.aportes).toBe(6);
    expect(r.totalAportado).toBe(600000);
    expect(r.valorFinal).toBe(600000);
    expect(r.rendimento).toBe(0);
  });

  it('se as ações dobram, o patrimônio fica acima do aportado', () => {
    const subindo = pregoes('2026-01-01', '2026-06-30', (i) => 100 + i);
    const r = simularPlanoNoPassado({ ...base, etfAcoes: subindo, etfExterior: subindo });
    expect(r.valorFinal).toBeGreaterThan(r.totalAportado);
  });

  it('respeita o mês inicial', () => {
    expect(simularPlanoNoPassado({ ...base, mesInicial: '2026-04' }).aportes).toBe(3);
  });
});

describe('comparação com CDI e Ibovespa', () => {
  it('mesmos aportes nas mesmas datas', () => {
    const cdi = [{ data: '2026-01-02', valor: 0.1 }, { data: '2026-01-05', valor: 0.1 }];
    const ibov = [{ data: '2026-01-02', preco: 100 }, { data: '2026-01-06', preco: 110 }];
    const [r] = compararComReferencias([{ data: '2026-01-02', valor: 100000 }], ['2026-01-06'], cdi, ibov);
    expect(r.cdi).toBe(Math.round(100000 * 1.001 ** 2));
    expect(r.ibov).toBe(110000);
  });

  it('sem histórico do Ibovespa não inventa número', () => {
    const [r] = compararComReferencias([{ data: '2026-01-02', valor: 100000 }], ['2026-01-06'], [], []);
    expect(r.ibov).toBeNull();
    expect(r.cdi).toBe(100000);
  });
});

describe('meta com prazo', () => {
  it('sem juro, divide o que falta pelos meses', () => {
    expect(aporteMensalNecessario(1200000, 0, 12, 0)).toBe(100000);
  });
  it('com juro, precisa de menos por mês', () => {
    expect(aporteMensalNecessario(1200000, 0, 12, 4)).toBeLessThan(100000);
  });
  it('saldo que já basta não pede aporte', () => {
    expect(aporteMensalNecessario(100000, 200000, 12, 4)).toBe(0);
  });
  it('conta meses entre datas', () => {
    expect(mesesAte('2026-10-27', '2031-10-01')).toBe(60);
  });
});

describe('sequência de constância', () => {
  it('conta meses seguidos até o atual', () => {
    const s = sequenciaDeMeses(['2026-08-05', '2026-09-05', '2026-10-05'], '2026-10-27');
    expect(s).toEqual({ atual: 3, recorde: 3, investiuEsteMes: true });
  });
  it('mês atual sem aporte ainda não quebra a sequência', () => {
    expect(sequenciaDeMeses(['2026-08-05', '2026-09-05'], '2026-10-27').atual).toBe(2);
  });
  it('buraco quebra a sequência, mas o recorde fica', () => {
    const s = sequenciaDeMeses(['2026-01-05', '2026-02-05', '2026-03-05', '2026-09-05'], '2026-10-27');
    expect(s.atual).toBe(1);
    expect(s.recorde).toBe(3);
  });
  it('troca de ano', () => {
    expect(sequenciaDeMeses(['2025-12-05', '2026-01-05'], '2026-01-20').atual).toBe(2);
  });
});

describe('imposto de renda', () => {
  const etf: Ativo = { id: 'e', codigo: 'BOVA11', nome: 'BOVA11', classe: 'acoes_br', tipo: 'etf', indexador: 'nenhum', vencimento: null, isentoIR: false };
  const mov = (id: string, tipo: 'compra' | 'venda', data: string, q: number, preco: number): Movimentacao =>
    ({ id, ativoId: 'e', tipo, data, quantidade: q, precoUnitario: preco, taxaContratada: null });

  it('vencimento do DARF: último dia útil do mês seguinte', () => {
    expect(vencimentoDarf('2026-10')).toBe('2026-11-30');
    expect(vencimentoDarf('2026-12')).toBe('2027-01-29');
  });

  it('15% sobre o lucro pelo custo médio', () => {
    const r = apurarVendasDeEtf([etf], [
      mov('1', 'compra', '2026-01-10', 10, 10000),
      mov('2', 'compra', '2026-02-10', 10, 12000), // custo médio R$ 110
      mov('3', 'venda', '2026-03-10', 10, 15000), // lucro 10 × R$ 40 = R$ 400
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ mes: '2026-03', resultado: 40000, baseDeCalculo: 40000, impostoDoMes: 6000, darf: 6000 });
  });

  it('prejuízo é compensado no mês seguinte', () => {
    const r = apurarVendasDeEtf([etf], [
      mov('1', 'compra', '2026-01-10', 20, 10000),
      mov('2', 'venda', '2026-02-10', 10, 8000), // prejuízo R$ 200
      mov('3', 'venda', '2026-03-10', 10, 15000), // lucro R$ 500 − 200 = R$ 300
    ]);
    expect(r[0]).toMatchObject({ resultado: -20000, darf: 0, prejuizoAcumulado: 20000 });
    expect(r[1]).toMatchObject({ resultado: 50000, prejuizoCompensado: 20000, baseDeCalculo: 30000, impostoDoMes: 4500 });
  });

  it('DARF abaixo de R$ 10 vai para o mês seguinte', () => {
    const r = apurarVendasDeEtf([etf], [
      mov('1', 'compra', '2026-01-10', 10, 10000),
      mov('2', 'venda', '2026-02-10', 1, 15000), // lucro R$ 50 → imposto R$ 7,50
      mov('3', 'venda', '2026-03-10', 1, 15000), // mais R$ 7,50 → R$ 15
    ]);
    expect(r[0]).toMatchObject({ impostoDoMes: 750, darf: 0 });
    expect(r[1]).toMatchObject({ impostoDoMes: 750, acumuladoAnterior: 750, darf: 1500 });
  });

  it('bens e direitos em 31/12 pelo custo de aquisição', () => {
    const b = bensEDireitos([etf], [
      mov('1', 'compra', '2025-11-10', 10, 10000),
      mov('2', 'venda', '2025-12-10', 4, 15000),
      mov('3', 'compra', '2026-01-10', 5, 9000), // depois de 31/12/2025: fora
    ], 2025);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ quantidade: 6, custo: 60000 });
  });
});
