import { describe, expect, it } from 'vitest';
import { alertasDoDia, posicoesAtuais, type AtivoAlerta, type EntradaAlertas } from './alertas';

const ativo = (id: string, classe: AtivoAlerta['classe'], tipo = 'etf', vencimento: string | null = null): AtivoAlerta => ({
  id, codigo: id.toUpperCase(), nome: `Ativo ${id}`, classe, tipo, vencimento,
});

const base: EntradaAlertas = {
  hoje: '2026-11-05',
  diaAporte: 5,
  aporteConfirmadoNoMes: false,
  pesos: { renda_fixa: 50, acoes_br: 25, exterior: 25 },
  posicoes: [],
};

describe('alertasDoDia', () => {
  it('lembra do aporte no dia e depois dele, uma chave por mês', () => {
    expect(alertasDoDia(base).map((a) => a.chave)).toEqual(['aporte:2026-11']);
    expect(alertasDoDia({ ...base, hoje: '2026-11-09' })[0].chave).toBe('aporte:2026-11');
  });

  it('não lembra antes do dia nem depois de confirmar', () => {
    expect(alertasDoDia({ ...base, hoje: '2026-11-04' })).toEqual([]);
    expect(alertasDoDia({ ...base, aporteConfirmadoNoMes: true })).toEqual([]);
  });

  it('avisa desvio de mais de 5 pontos, ignorando a reserva', () => {
    const e = {
      ...base,
      aporteConfirmadoNoMes: true,
      posicoes: [
        { ativo: ativo('rf', 'renda_fixa', 'tesouro'), quantidade: 1, valor: 400 },
        { ativo: ativo('br', 'acoes_br'), quantidade: 1, valor: 400 },
        { ativo: ativo('ex', 'exterior'), quantidade: 1, valor: 200 },
        { ativo: ativo('rs', 'reserva', 'tesouro'), quantidade: 1, valor: 9000 },
      ],
    };
    const [a] = alertasDoDia(e);
    expect(a.chave).toBe('desvio:2026-11');
    expect(a.corpo).toContain('Renda fixa está em 40% (alvo 50%)');
    expect(a.corpo).toContain('Ações Brasil está em 40% (alvo 25%)');
    expect(a.corpo).not.toContain('Exterior');
  });

  it('não avisa desvio em carteira muito pequena', () => {
    const e = { ...base, aporteConfirmadoNoMes: true, posicoes: [{ ativo: ativo('br', 'acoes_br'), quantidade: 1, valor: 300 }] };
    expect(alertasDoDia(e)).toEqual([]);
  });

  it('avisa títulos que vencem em até 7 dias', () => {
    const e = {
      ...base,
      aporteConfirmadoNoMes: true,
      posicoes: [
        { ativo: ativo('a', 'reserva', 'cdb', '2026-11-05'), quantidade: 1, valor: 100 },
        { ativo: ativo('b', 'reserva', 'cdb', '2026-11-06'), quantidade: 1, valor: 100 },
        { ativo: ativo('c', 'reserva', 'cdb', '2026-11-12'), quantidade: 1, valor: 100 },
        { ativo: ativo('d', 'reserva', 'cdb', '2026-11-13'), quantidade: 1, valor: 100 },
        { ativo: ativo('e', 'reserva', 'cdb', '2026-11-01'), quantidade: 1, valor: 100 },
      ],
    };
    expect(alertasDoDia(e).map((a) => a.titulo)).toEqual([
      'Ativo a vence hoje',
      'Ativo b vence amanhã',
      'Ativo c vence em 7 dias (12/11/2026)',
    ]);
    expect(alertasDoDia(e)[0].chave).toBe('vencimento:a:2026-11-05');
  });
});

describe('posicoesAtuais', () => {
  const ativos = [ativo('bova', 'acoes_br'), ativo('cdb', 'renda_fixa', 'cdb')];

  it('usa preço de mercado para ETF e abate vendas pelo custo médio', () => {
    const [p] = posicoesAtuais(
      ativos,
      [
        { ativoId: 'bova', tipo: 'compra', data: '2026-01-10', quantidade: 10, valorTotal: 1000 },
        { ativoId: 'bova', tipo: 'venda', data: '2026-02-10', quantidade: 4, valorTotal: 500 },
      ],
      { BOVA: 130 },
      {},
    );
    expect(p.quantidade).toBeCloseTo(6);
    expect(p.valor).toBeCloseTo(780);
  });

  it('usa o extrato quando é mais novo que a última compra, senão o custo', () => {
    const movs = [{ ativoId: 'cdb', tipo: 'compra' as const, data: '2026-03-01', quantidade: 1, valorTotal: 2000 }];
    expect(posicoesAtuais(ativos, movs, {}, { cdb: { data: '2026-10-01', valor: 2150 } })[0].valor).toBe(2150);
    expect(posicoesAtuais(ativos, movs, {}, { cdb: { data: '2026-02-01', valor: 1500 } })[0].valor).toBe(2000);
  });

  it('ignora o que foi vendido por inteiro', () => {
    const movs = [
      { ativoId: 'bova', tipo: 'compra' as const, data: '2026-01-10', quantidade: 2, valorTotal: 200 },
      { ativoId: 'bova', tipo: 'venda' as const, data: '2026-01-20', quantidade: 2, valorTotal: 210 },
    ];
    expect(posicoesAtuais(ativos, movs, { BOVA: 100 }, {})).toEqual([]);
  });
});
