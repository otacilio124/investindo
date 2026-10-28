import { describe, expect, it } from 'vitest';
import { classificarB3, lerListaBrapi, lerRSS, lerYahooHistorico, resumoDosCandles, SIMBOLOS_GLOBAIS, simboloYahoo, textoLimpo } from './mercado';

describe('catálogo do mercado', () => {
  it('classifica ações, FIIs, ETFs e BDRs da B3 e ignora o fracionário', () => {
    expect(classificarB3({ stock: 'PETR4', type: 'stock' })).toBe('acao');
    expect(classificarB3({ stock: 'MXRF11', type: 'fund', name: 'MAXI RENDA FUNDO DE INVESTIMENTO IMOBILIÁRIO - FII' })).toBe('fii');
    expect(classificarB3({ stock: 'BOVA11', type: 'fund', name: 'ISHARES IBOVESPA CLASSE DE ÍNDICE' })).toBe('etf');
    expect(classificarB3({ stock: 'AAPL34', type: 'bdr' })).toBe('bdr');
    expect(classificarB3({ stock: 'PETR4F', type: 'stock' })).toBeNull();
    expect(classificarB3({ stock: 'XYZ', type: 'stock' })).toBeNull();
  });

  it('lê a lista da brapi com setor traduzido e sem números inválidos', () => {
    const linhas = lerListaBrapi({
      stocks: [
        { stock: 'VALE3', name: 'VALE S.A.', close: 61.59, change: -1.2, volume: 17470700, market_cap: 2.6e11, logo: 'https://icons.brapi.dev/icons/VALE3.svg', sector: 'Non-Energy Minerals', type: 'stock' },
        { stock: 'HGLG11', name: 'PÁTRIA LOG - FUNDO DE INVESTIMENTO IMOBILIÁRIO - RESPONSABILIDADE LIMITADA', close: 0, change: null, volume: 0, logo: 'http://x', type: 'fund' },
        { stock: 'VALE3F', name: 'VALE', close: 61.6, type: 'stock' },
      ],
    });
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ codigo: 'VALE3', tipo: 'acao', setor: 'Mineração e siderurgia', preco: 61.59, variacao: -1.2, mercado: 'B3' });
    expect(linhas[1]).toMatchObject({ codigo: 'HGLG11', tipo: 'fii', nome: 'PÁTRIA LOG - FUNDO DE INVESTIMENTO IMOBILIÁRIO', preco: null, variacao: null, logo_url: null });
  });

  it('globais têm códigos únicos e viram símbolos do Yahoo', () => {
    const codigos = SIMBOLOS_GLOBAIS.map((s) => s.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(simboloYahoo('BTC')).toBe('BTC-USD');
    expect(simboloYahoo('DJI')).toBe('^DJI');
  });

  it('resume preço e variação do dia pelos dois últimos candles', () => {
    const c = (fechamento: number) => ({ data: '2026-10-27', abertura: fechamento, maxima: fechamento, minima: fechamento, fechamento, volume: 0 });
    expect(resumoDosCandles([c(100), c(102)])).toEqual({ preco: 102, variacao: 2, volume: null });
  });
});

describe('histórico OHLC do Yahoo', () => {
  const json = (quote: Record<string, (number | null)[]>, timestamp = [1792846800, 1792933200, 1793019600]) => ({
    chart: { result: [{ meta: { gmtoffset: -10800 }, timestamp, indicators: { quote: [quote] } }] },
  });

  it('converte timestamps para a data da bolsa e mantém OHLCV', () => {
    const c = lerYahooHistorico(json({ open: [10, 11, 12], high: [11, 12, 13], low: [9.5, 10.5, 11.5], close: [10.8, 11.9, 12.2], volume: [100, 200, 300] }));
    expect(c).toHaveLength(3);
    expect(c[0]).toEqual({ data: '2026-10-24', abertura: 10, maxima: 11, minima: 9.5, fechamento: 10.8, volume: 100 });
  });

  it('descarta candles incompletos ou incoerentes', () => {
    const c = lerYahooHistorico(json({ open: [10, null, 12], high: [11, 12, 9], low: [9.5, 10.5, 11.5], close: [10.8, 11.9, 12.2], volume: [0, 0, 0] }));
    expect(c.map((x) => x.data)).toEqual(['2026-10-24']);
  });

  it('códigos do painel viram símbolos do Yahoo', () => {
    expect(simboloYahoo('IBOV')).toBe('^BVSP');
    expect(simboloYahoo('BOVA11')).toBe('BOVA11.SA');
  });
});

describe('notícias por RSS', () => {
  const agora = new Date('2026-10-27T15:00:00Z');

  it('lê título, link, resumo limpo, imagem e data (InfoMoney)', () => {
    const xml = `<rss><channel><item>
      <title>Aplicação no Tesouro desvaloriza até 16%</title>
      <link>https://www.infomoney.com.br/onde-investir/x/</link>
      <pubDate>Tue, 27 Oct 2026 14:30:25 +0000</pubDate>
      <description><![CDATA[<p><img width="300" src="https://www.infomoney.com.br/foto.jpg?fit=300" /></p><p>Quem comprou títulos &amp; prefixados perdeu.</p>]]></description>
    </item></channel></rss>`;
    const [n] = lerRSS(xml, 'InfoMoney', agora);
    expect(n).toEqual({
      url: 'https://www.infomoney.com.br/onde-investir/x/',
      titulo: 'Aplicação no Tesouro desvaloriza até 16%',
      resumo: 'Quem comprou títulos & prefixados perdeu.',
      imagemUrl: 'https://www.infomoney.com.br/foto.jpg?fit=300',
      fonte: 'InfoMoney',
      publicadoEm: '2026-10-27T14:30:25.000Z',
    });
  });

  it('usa o subtítulo do g1 como resumo', () => {
    const xml = `<item><title>Ministro fala do imposto</title><atom:subtitle>Proposta vai ao Congresso.</atom:subtitle>
      <link>https://g1.globo.com/economia/noticia/a.ghtml</link><description><![CDATA[ <img src="https://s2-g1.glbimg.com/x.jpg" /><br /> ]]> Texto longo.</description></item>`;
    const [n] = lerRSS(xml, 'g1 Economia', agora);
    expect(n.resumo).toBe('Proposta vai ao Congresso.');
    expect(n.imagemUrl).toBe('https://s2-g1.glbimg.com/x.jpg');
    expect(n.publicadoEm).toBe(agora.toISOString()); // sem data no item: hora da coleta
  });

  it('Agência Brasil: imagem de destaque, ignora pixel de rastreio e loterias', () => {
    const xml = `<item><title>Mega-Sena acumula</title><link>https://agenciabrasil.ebc.com.br/a</link></item>
      <item><title>Inflação desacelera em outubro</title><link>https://agenciabrasil.ebc.com.br/b</link>
      <imagem-destaque>https://imagens.ebc.com.br/foto.jpg</imagem-destaque>
      <description>&lt;p&gt;IPCA-15 sobe 0,2%.&lt;img src=&quot;https://agenciabrasil.ebc.com.br/ebc.png?id=1&quot; /&gt;&lt;/p&gt;</description></item>`;
    const n = lerRSS(xml, 'Agência Brasil', agora);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ titulo: 'Inflação desacelera em outubro', resumo: 'IPCA-15 sobe 0,2%.', imagemUrl: 'https://imagens.ebc.com.br/foto.jpg' });
  });

  it('ignora HTML codificado dentro de atributos (InfoMoney)', () => {
    const descricao = `<![CDATA[<p><img src="https://x.com/a.jpg" data-image-caption="&lt;p&gt;Banco do Brasil&lt;/p&gt;" data-large-file="https://x.com/b.jpg" /></p><p>Ações sobem 5%.</p>]]>`;
    expect(textoLimpo(descricao)).toBe('Ações sobem 5%.');
  });

  it('corta resumos longos na palavra', () => {
    const t = textoLimpo('palavra '.repeat(60), 30);
    expect(t.length).toBeLessThanOrEqual(31);
    expect(t.endsWith('…')).toBe(true);
  });

  it('recusa links que não são https', () => {
    expect(lerRSS('<item><title>x</title><link>javascript:alert(1)</link></item>', 'X', agora)).toHaveLength(0);
  });
});
