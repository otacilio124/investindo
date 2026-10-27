import { describe, expect, it } from 'vitest';
import { dividirProporcional, ratear, validarPesos, type EntradaRateio } from './rateio';
import { CARTEIRA_ALVO } from './tipos';

const base = (parcial: Partial<EntradaRateio> = {}): EntradaRateio => ({
  aporte: 70000,
  caixaPendente: 0,
  reserva: { saldo: 1000000, meta: 1000000, produto: 'Tesouro Selic' },
  saldos: { renda_fixa: 0, acoes_br: 0, exterior: 0 },
  pesos: CARTEIRA_ALVO.moderado,
  etfs: { acoes_br: { codigo: 'BOVA11', preco: null }, exterior: { codigo: 'IVVB11', preco: null } },
  rendaFixa: { produto: 'Tesouro IPCA+ 2035', minimo: 3000 },
  ...parcial,
});

const valorDe = (r: ReturnType<typeof ratear>, classe: string) =>
  r.itens.filter((i) => i.classe === classe).reduce((a, i) => a + i.valor, 0);

describe('dividirProporcional', () => {
  it('a soma das partes é sempre o total', () => {
    expect(dividirProporcional(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(dividirProporcional(70000, [32500, 52500])).toEqual([26765, 43235]);
  });
  it('pesos zerados não recebem nada', () => {
    expect(dividirProporcional(500, [0, 0])).toEqual([0, 0]);
  });
});

describe('ratear — exemplos do escopo', () => {
  it('R$ 700, moderado, reserva completa, carteira de R$ 3.000 → 0 / 268 / 432', () => {
    const r = ratear(base({ saldos: { renda_fixa: 200000, acoes_br: 60000, exterior: 40000 } }));
    expect(valorDe(r, 'renda_fixa')).toBe(0);
    expect(valorDe(r, 'acoes_br')).toBe(26765); // R$ 267,65 ≈ 268
    expect(valorDe(r, 'exterior')).toBe(43235); // R$ 432,35 ≈ 432
    expect(r.caixaPendenteNovo).toBe(0);
  });

  it('carteira zerada → 350 / 175 / 175', () => {
    const r = ratear(base());
    expect(valorDe(r, 'renda_fixa')).toBe(35000);
    expect(valorDe(r, 'acoes_br')).toBe(17500);
    expect(valorDe(r, 'exterior')).toBe(17500);
  });
});

describe('ratear — reserva', () => {
  it('só completa a reserva e o excedente segue para as classes', () => {
    const r = ratear(base({ reserva: { saldo: 980000, meta: 1000000, produto: 'Tesouro Selic' } }));
    expect(valorDe(r, 'reserva')).toBe(20000);
    expect(valorDe(r, 'renda_fixa') + valorDe(r, 'acoes_br') + valorDe(r, 'exterior')).toBe(50000);
  });

  it('avisa quando o valor da reserva não atinge o mínimo do produto', () => {
    const r = ratear(base({ reserva: { saldo: 980000, meta: 1000000, produto: 'Tesouro Selic', minimo: 20170 } }));
    expect(r.itens.find((i) => i.classe === 'reserva')!.motivo).toMatch(/CDB de liquidez diária/);
  });

  it('reserva longe da meta leva o aporte inteiro', () => {
    const r = ratear(base({ reserva: { saldo: 0, meta: 1000000, produto: 'Tesouro Selic' } }));
    expect(r.itens).toHaveLength(1);
    expect(valorDe(r, 'reserva')).toBe(70000);
  });
});

describe('ratear — cotas inteiras e sobras', () => {
  it('sobra das cotas vai para a renda fixa no mesmo mês', () => {
    const r = ratear(
      base({
        saldos: { renda_fixa: 200000, acoes_br: 60000, exterior: 40000 },
        etfs: { acoes_br: { codigo: 'BOVA11', preco: 13000 }, exterior: { codigo: 'IVVB11', preco: 38000 } },
      }),
    );
    const bova = r.itens.find((i) => i.produto === 'BOVA11')!;
    const ivvb = r.itens.find((i) => i.produto === 'IVVB11')!;
    expect(bova.quantidade).toBe(2);
    expect(ivvb.quantidade).toBe(1);
    expect(valorDe(r, 'renda_fixa')).toBe(26765 - 26000 + (43235 - 38000));
    // nada se perde: tudo o que entrou foi distribuído ou guardado
    const distribuido = r.itens.reduce((a, i) => a + i.valor, 0) + r.caixaPendenteNovo;
    expect(distribuido).toBe(r.disponivel);
  });

  it('valor que não paga uma cota vai para a renda fixa e a classe segue abaixo do alvo', () => {
    const r = ratear(
      base({ etfs: { acoes_br: { codigo: 'BOVA11', preco: 13000 }, exterior: { codigo: 'IVVB11', preco: 38000 } } }),
    );
    expect(r.itens.find((i) => i.produto === 'IVVB11')).toBeUndefined();
    expect(valorDe(r, 'renda_fixa')).toBe(35000 + 17500 + (17500 - 13000));
    expect(r.passos.some((p) => p.includes('não pagam uma cota de IVVB11'))).toBe(true);
  });

  it('sem cotação mostra só o valor, sem quantidade', () => {
    const r = ratear(base());
    expect(r.itens.find((i) => i.produto === 'BOVA11')?.quantidade).toBeNull();
  });
});

describe('ratear — mínimo da renda fixa e caixa pendente', () => {
  it('renda fixa abaixo do mínimo fica guardada para o mês seguinte', () => {
    const r = ratear(
      base({
        aporte: 2000,
        saldos: { renda_fixa: 100000, acoes_br: 0, exterior: 0 },
        etfs: { acoes_br: { codigo: 'BOVA11', preco: 13000 }, exterior: { codigo: 'IVVB11', preco: 38000 } },
      }),
    );
    expect(r.itens).toHaveLength(0);
    expect(r.caixaPendenteNovo).toBe(2000);
  });

  it('caixa pendente soma ao aporte do mês seguinte', () => {
    const r = ratear(base({ caixaPendente: 5000 }));
    expect(r.disponivel).toBe(75000);
    expect(r.itens.reduce((a, i) => a + i.valor, 0)).toBe(75000);
  });
});

describe('validações', () => {
  it('percentuais precisam somar 100', () => {
    expect(validarPesos({ renda_fixa: 50, acoes_br: 25, exterior: 20 })).toMatch(/95%/);
    expect(validarPesos(CARTEIRA_ALVO.arrojado)).toBeNull();
  });
  it('aporte inválido é recusado', () => {
    expect(() => ratear(base({ aporte: -1 }))).toThrow();
    expect(() => ratear(base({ aporte: 10.5 }))).toThrow();
  });
});
