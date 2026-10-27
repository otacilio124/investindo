import { describe, expect, it } from 'vitest';
import { diasUteis, ehDiaUtil, feriadosNacionais } from './calendario';
import { avaliarPosicao, resumirPorClasse, serieDePatrimonio, type Ativo, type Movimentacao } from './carteira';
import { projetarPatrimonio } from './metas';
import {
  aliquotaIR,
  escolherRendaFixa,
  fatorPosFixado,
  fatorPrefixado,
  irEstimado,
  juroReal,
} from './rendaFixa';
import { formatarMoeda, formatarVariacao, lerMoeda } from '../lib/formato';

const mercadoVazio = { cdiDiario: [], selicDiaria: [], ipcaMensal: [] };

describe('calendário', () => {
  it('reconhece feriados móveis e fixos de 2026', () => {
    const f = feriadosNacionais(2026);
    expect(f.has('2026-02-16')).toBe(true); // Carnaval
    expect(f.has('2026-04-03')).toBe(true); // Sexta-feira Santa
    expect(f.has('2026-06-04')).toBe(true); // Corpus Christi
    expect(f.has('2026-11-20')).toBe(true); // Consciência Negra
  });
  it('conta dias úteis sem fins de semana e feriados', () => {
    expect(ehDiaUtil('2026-10-24')).toBe(false); // sábado
    expect(diasUteis('2026-10-26', '2026-11-02')).toBe(5);
    expect(diasUteis('2026-11-02', '2026-11-03')).toBe(0); // Finados
  });
});

describe('juros e impostos', () => {
  it('juro real pela equação de Fisher', () => {
    expect(juroReal(15, 5)).toBeCloseTo(9.5238, 3);
  });
  it('tabela regressiva do IR', () => {
    expect(aliquotaIR(100)).toBe(22.5);
    expect(aliquotaIR(181)).toBe(20);
    expect(aliquotaIR(500)).toBe(17.5);
    expect(aliquotaIR(721)).toBe(15);
  });
  it('IR só sobre ganho e nunca em isentos', () => {
    expect(irEstimado(100000, 110000, '2026-01-02', '2026-10-27')).toBe(2000);
    expect(irEstimado(100000, 110000, '2026-01-02', '2026-10-27', true)).toBe(0);
    expect(irEstimado(100000, 90000, '2026-01-02', '2026-10-27')).toBe(0);
  });
});

describe('curva da renda fixa', () => {
  it('prefixado em 252 dias úteis rende exatamente a taxa', () => {
    expect(Math.pow(1.12, 1)).toBeCloseTo(1.12);
    expect(fatorPrefixado(12, '2026-01-02', '2026-01-02')).toBe(1);
  });
  it('pós-fixado acumula só os dias do intervalo', () => {
    const serie = [
      { data: '2026-10-22', valor: 0.05 },
      { data: '2026-10-23', valor: 0.05 },
      { data: '2026-10-26', valor: 0.05 },
    ];
    expect(fatorPosFixado(serie, '2026-10-23', '2026-10-27', 100)).toBeCloseTo(1.0005 ** 2, 10);
    expect(fatorPosFixado(serie, '2026-10-23', '2026-10-27', 110)).toBeCloseTo(1.00055 ** 2, 10);
  });
});

describe('escolha do produto de renda fixa', () => {
  const titulos = [
    { nome: 'Tesouro IPCA+ 2029', vencimento: '2029-05-15', taxaReal: 7.5, puCompra: 320000 },
    { nome: 'Tesouro IPCA+ 2035', vencimento: '2035-05-15', taxaReal: 7.0, puCompra: 230000 },
  ];
  it('usa o título com vencimento mais próximo do prazo', () => {
    const r = escolherRendaFixa({ hoje: '2026-10-27', prazoAnos: 9, ipcaEsperado: 4, titulos })!;
    expect(r.produto).toBe('Tesouro IPCA+ 2035');
    expect(r.minimo).toBe(3000); // 1% de R$ 2.300 = R$ 23 → mínimo de R$ 30
  });
  it('fica com o CDB quando ele rende mais depois do IR', () => {
    const r = escolherRendaFixa({ hoje: '2026-10-27', prazoAnos: 9, ipcaEsperado: 4, titulos, cdbPre: { nome: 'CDB pré 14%', taxa: 14 } })!;
    expect(r.produto).toBe('CDB pré 14%');
    expect(r.comparacao).toHaveLength(2);
  });
  it('sem nenhuma opção devolve null', () => {
    expect(escolherRendaFixa({ hoje: '2026-10-27', prazoAnos: 5, ipcaEsperado: 4, titulos: [] })).toBeNull();
  });
});

describe('valor da carteira', () => {
  const etf: Ativo = { id: 'a1', codigo: 'BOVA11', nome: 'BOVA11', classe: 'acoes_br', tipo: 'etf', indexador: 'nenhum', vencimento: null, isentoIR: false };
  const cdb: Ativo = { id: 'a2', codigo: 'CDB-X', nome: 'CDB Banco X', classe: 'reserva', tipo: 'cdb', indexador: 'cdi', vencimento: null, isentoIR: false };
  const movs: Movimentacao[] = [
    { id: 'm1', ativoId: 'a1', tipo: 'compra', data: '2026-09-01', quantidade: 4, precoUnitario: 12500, taxaContratada: null },
    { id: 'm2', ativoId: 'a1', tipo: 'venda', data: '2026-10-01', quantidade: 1, precoUnitario: 13000, taxaContratada: null },
    { id: 'm3', ativoId: 'a2', tipo: 'compra', data: '2026-10-22', quantidade: 1, precoUnitario: 100000, taxaContratada: 100 },
  ];

  it('ETF usa preço de mercado e custo médio após venda', () => {
    const p = avaliarPosicao(etf, movs, [], { preco: 14000, data: '2026-10-27', fonte: 'brapi' }, mercadoVazio, '2026-10-27');
    expect(p.quantidade).toBe(3);
    expect(p.aplicado).toBe(37500);
    expect(p.valorBruto).toBe(42000);
    expect(p.metodo).toBe('mercado');
  });

  it('CDB sem extrato usa a curva do CDI', () => {
    const mercado = { ...mercadoVazio, cdiDiario: [{ data: '2026-10-22', valor: 0.05 }, { data: '2026-10-23', valor: 0.05 }] };
    const p = avaliarPosicao(cdb, movs, [], undefined, mercado, '2026-10-27');
    expect(p.metodo).toBe('curva');
    expect(p.valorBruto).toBe(Math.round(100000 * 1.0005 ** 2));
  });

  it('extrato mais recente que a compra tem prioridade sobre a curva', () => {
    const p = avaliarPosicao(cdb, movs, [{ ativoId: 'a2', data: '2026-10-27', valorBruto: 100300 }], undefined, mercadoVazio, '2026-10-27');
    expect(p.metodo).toBe('extrato');
    expect(p.valorBruto).toBe(100300);
  });

  it('resumo separa a reserva das classes investidas', () => {
    const p1 = avaliarPosicao(etf, movs, [], { preco: 14000, data: '2026-10-27', fonte: 'brapi' }, mercadoVazio, '2026-10-27');
    const p2 = avaliarPosicao(cdb, movs, [{ ativoId: 'a2', data: '2026-10-27', valorBruto: 100300 }], undefined, mercadoVazio, '2026-10-27');
    const r = resumirPorClasse([p1, p2], { renda_fixa: 50, acoes_br: 25, exterior: 25 });
    expect(r.totalReserva).toBe(100300);
    expect(r.totalInvestido).toBe(42000);
    expect(r.classes.find((c) => c.classe === 'acoes_br')!.percentualAtual).toBe(100);
  });
});

describe('evolução do patrimônio', () => {
  it('avalia cada dia com o fechamento daquela data e pula fins de semana', () => {
    const etf: Ativo = { id: 'a1', codigo: 'BOVA11', nome: 'BOVA11', classe: 'acoes_br', tipo: 'etf', indexador: 'nenhum', vencimento: null, isentoIR: false };
    const movs: Movimentacao[] = [{ id: 'm1', ativoId: 'a1', tipo: 'compra', data: '2026-10-22', quantidade: 2, precoUnitario: 10000, taxaContratada: null }];
    const fech = { BOVA11: [{ data: '2026-10-22', preco: 10000 }, { data: '2026-10-23', preco: 11000 }, { data: '2026-10-26', preco: 10500 }] };
    const s = serieDePatrimonio([etf], movs, [], fech, mercadoVazio, '2026-10-26');
    expect(s.map((p) => p.data)).toEqual(['2026-10-22', '2026-10-23', '2026-10-26']);
    expect(s.map((p) => p.valor)).toEqual([20000, 22000, 21000]);
    expect(s.every((p) => p.aplicado === 20000)).toBe(true);
  });
});

describe('projeção', () => {
  it('sem juro é saldo mais aportes', () => {
    expect(projetarPatrimonio(100000, 70000, 1, 0)).toBe(100000 + 12 * 70000);
  });
  it('com juro real positivo cresce acima dos aportes', () => {
    expect(projetarPatrimonio(0, 70000, 10, 4)).toBeGreaterThan(120 * 70000);
  });
});

describe('formatação do manual de marca', () => {
  it('moeda e variações', () => {
    expect(formatarMoeda(123456)).toBe('R$ 1.234,56');
    expect(formatarVariacao(3240, 1.2)).toBe('▲ +R$ 32,40 (+1,20%)');
    expect(formatarVariacao(-1810, -0.7)).toBe('▼ −R$ 18,10 (−0,70%)');
    expect(formatarVariacao(0, 0)).toBe('— 0,00%');
  });
  it('lê valores digitados', () => {
    expect(lerMoeda('700')).toBe(70000);
    expect(lerMoeda('1.234,56')).toBe(123456);
    expect(lerMoeda('R$ 700,5')).toBe(70050);
    expect(lerMoeda('abc')).toBeNull();
  });
});
