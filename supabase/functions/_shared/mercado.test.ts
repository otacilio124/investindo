import { describe, expect, it } from 'vitest';
import { lerRSS, lerYahooHistorico, simboloYahoo, textoLimpo } from './mercado';

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
