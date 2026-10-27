import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fisher,
  identificarTitulo,
  lerBrapi,
  lerFocus,
  lerPTAX,
  lerSGS,
  lerSIDRA,
  lerTesouroCSV,
  lerYahoo,
  precoConfere,
  primeiraQueResponde,
  urlSGS,
  valorPlausivel,
} from './fontes';

afterEach(() => vi.restoreAllMocks());

describe('parsers das fontes', () => {
  it('SGS: datas brasileiras e valores com ponto', () => {
    expect(lerSGS([{ data: '24/10/2026', valor: '0.055131' }, { data: '23/10/2026', valor: '0.055131' }])).toEqual([
      { data: '2026-10-23', valor: 0.055131 },
      { data: '2026-10-24', valor: 0.055131 },
    ]);
  });

  it('SGS: sempre pede janela de datas', () => {
    expect(urlSGS(432, '2026-09-27', '2026-10-27')).toContain('dataInicial=27/09/2026&dataFinal=27/10/2026');
  });

  it('PTAX: pega a cotação mais recente do período', () => {
    const json = { value: [
      { cotacaoVenda: 5.41, dataHoraCotacao: '2026-10-23 13:05:00.000' },
      { cotacaoVenda: 5.38, dataHoraCotacao: '2026-10-26 13:04:00.000' },
    ] };
    expect(lerPTAX(json)).toEqual({ data: '2026-10-26', valor: 5.38 });
  });

  it('Focus: prefere a base de cálculo 0', () => {
    const json = { value: [
      { Data: '2026-10-24', Mediana: 4.3, baseCalculo: 1 },
      { Data: '2026-10-24', Mediana: 4.1, baseCalculo: 0 },
    ] };
    expect(lerFocus(json)).toEqual({ data: '2026-10-24', valor: 4.1 });
  });

  it('SIDRA: pula a linha de cabeçalho', () => {
    const json = [{ V: 'Valor', D3C: 'Mês (Código)' }, { V: '4.68', D3C: '202609' }];
    expect(lerSIDRA(json)).toEqual({ data: '2026-09-01', valor: 4.68 });
  });

  it('Tesouro CSV: só a data-base mais recente, decimais com vírgula', () => {
    const csv = [
      'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha',
      'Tesouro IPCA+;15/05/2035;23/10/2026;7,10;7,22;2.301,55;2.280,10;2.280,10',
      'Tesouro IPCA+;15/05/2035;24/10/2026;7,05;7,17;2.310,00;2.290,44;2.290,44',
      'Tesouro Selic;01/03/2029;24/10/2026;0,05;0,07;17.000,10;16.990,00;16.990,00',
      'Tesouro Prefixado;01/01/2027;22/10/2026;14,00;14,10;980,00;979,00;979,00',
    ].join('\r\n');
    const t = lerTesouroCSV(csv);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ tipo: 'Tesouro IPCA+', vencimento: '2035-05-15', dataBase: '2026-10-24', taxaCompra: 7.05, puVenda: 2290.44 });
  });

  it('Tesouro: classe e indexador pelo nome do título', () => {
    expect(identificarTitulo({ tipo: 'Tesouro Selic', vencimento: '2029-03-01' })).toMatchObject({ classe: 'reserva', indexador: 'selic', nome: 'Tesouro Selic 2029' });
    expect(identificarTitulo({ tipo: 'Tesouro IPCA+', vencimento: '2035-05-15' })).toMatchObject({ classe: 'renda_fixa', indexador: 'ipca' });
  });

  it('brapi e Yahoo', () => {
    expect(lerBrapi({ results: [{ symbol: 'BOVA11', regularMarketPrice: 130.5, regularMarketTime: '2026-10-27T17:00:00.000Z' }] }, 'BOVA11')).toMatchObject({ preco: 130.5, data: '2026-10-27' });
    expect(lerYahoo({ chart: { result: [{ meta: { regularMarketPrice: 380.2, regularMarketTime: 1793120400, currency: 'BRL' } }] } }, 'IVVB11').preco).toBe(380.2);
    expect(() => lerYahoo({ chart: { result: [{ meta: { regularMarketPrice: 70, currency: 'USD' } }] } }, 'IVVB11')).toThrow(/moeda/);
  });
});

describe('redundância', () => {
  it('valores absurdos são recusados', () => {
    expect(valorPlausivel('selic_meta', 15)).toBe(true);
    expect(valorPlausivel('selic_meta', 1500)).toBe(false);
    expect(valorPlausivel('dolar_ptax', Number.NaN)).toBe(false);
  });

  it('usa a fonte seguinte quando a primeira falha ou traz valor implausível', async () => {
    const leitura = (valor: number, fonte: string) => async () => ({ codigo: 'ipca_12m', nome: '', unidade: '%', valor, dataReferencia: '2026-09-01', fonte, fonteUrl: '' });
    const r = await primeiraQueResponde('ipca_12m', [
      async () => { throw new Error('SGS fora do ar'); },
      leitura(999, 'fonte doida'),
      leitura(4.68, 'IBGE'),
    ]);
    expect(r.leitura?.fonte).toBe('IBGE');
    expect(r.erros).toHaveLength(2);
  });

  it('sem nenhuma fonte devolve null (o coletor mantém o último valor)', async () => {
    const r = await primeiraQueResponde('selic_meta', [async () => { throw new Error('fora do ar'); }]);
    expect(r.leitura).toBeNull();
  });

  it('preços de duas fontes conferem dentro de 2%', () => {
    expect(precoConfere(100, 101.5)).toBe(true);
    expect(precoConfere(100, 105)).toBe(false);
  });

  it('juro real pela equação de Fisher', () => {
    expect(fisher(15, 5)).toBe(9.52);
  });
});
