import { describe, expect, it } from 'vitest';
import { aportesPorMes, type Ativo, type Movimentacao } from './carteira';

const ativo = (id: string, classe: Ativo['classe']): Ativo => ({
  id, codigo: id, nome: id, classe, tipo: 'etf', indexador: 'nenhum', vencimento: null, isentoIR: false,
});
const mov = (ativoId: string, data: string, quantidade: number, preco: number, tipo: Movimentacao['tipo'] = 'compra'): Movimentacao => ({
  id: `${ativoId}-${data}`, ativoId, tipo, data, quantidade, precoUnitario: preco, taxaContratada: null,
});

describe('aportesPorMes', () => {
  const ativos = [ativo('bova', 'acoes_br'), ativo('selic', 'reserva')];

  it('soma as compras por mês e classe, com meses vazios zerados', () => {
    const r = aportesPorMes(
      [mov('bova', '2026-09-03', 2, 13000), mov('selic', '2026-09-03', 1, 40000), mov('bova', '2026-11-05', 1, 13500)],
      ativos, '2026-11-20', 3,
    );
    expect(r.map((m) => m.mes)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(r[0]).toMatchObject({ total: 66000, porClasse: { acoes_br: 26000, reserva: 40000 } });
    expect(r[1].total).toBe(0);
    expect(r[2].porClasse.acoes_br).toBe(13500);
  });

  it('ignora vendas e compras fora da janela', () => {
    const r = aportesPorMes([mov('bova', '2026-11-05', 1, 13500, 'venda'), mov('bova', '2025-01-05', 1, 9000)], ativos, '2026-11-20', 12);
    expect(r.every((m) => m.total === 0)).toBe(true);
    expect(r[0].mes).toBe('2025-12');
  });

  it('vira o ano corretamente', () => {
    expect(aportesPorMes([], ativos, '2027-02-01', 4).map((m) => m.mes)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});
