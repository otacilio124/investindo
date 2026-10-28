/**
 * Histórico OHLC (candles) e notícias de economia. Puro (só `fetch`), testado
 * pelo Vitest em mercado.test.ts e usado pelo coletor.
 *
 *   Candles .. Yahoo Finance (gratuito, sem token): ETFs, Ibovespa, dólar, S&P 500
 *   Notícias . RSS da Agência Brasil (licença CC BY), g1 Economia e InfoMoney
 */

import { buscar } from './fontes.ts';

/* ------------------------------------------------------------------ */
/* Ativos acompanhados no painel de mercado                            */
/* ------------------------------------------------------------------ */

export interface SimboloMercado {
  codigo: string;
  yahoo: string;
  nome: string;
  tipo: 'indice' | 'moeda' | 'etf';
}

export const SIMBOLOS_MERCADO: SimboloMercado[] = [
  { codigo: 'IBOV', yahoo: '^BVSP', nome: 'Ibovespa', tipo: 'indice' },
  { codigo: 'USDBRL', yahoo: 'BRL=X', nome: 'Dólar', tipo: 'moeda' },
  { codigo: 'SP500', yahoo: '^GSPC', nome: 'S&P 500', tipo: 'indice' },
];

/* ------------------------------------------------------------------ */
/* Catálogo: B3 inteira (brapi) + o "mundo" do app Bolsa do iPhone      */
/* ------------------------------------------------------------------ */

export type TipoCatalogo = 'acao' | 'fii' | 'etf' | 'fundo' | 'bdr' | 'indice' | 'acao_exterior' | 'moeda' | 'cripto' | 'commodity';

export interface AtivoCatalogo {
  codigo: string;
  nome: string;
  tipo: TipoCatalogo;
  mercado: 'B3' | 'EUA' | 'Global';
  moeda: 'BRL' | 'USD' | 'EUR' | 'JPY' | 'GBP' | 'HKD' | 'PTS';
  setor: string | null;
  logo_url: string | null;
  preco: number | null;
  variacao: number | null;
  volume: number | null;
  valor_mercado: number | null;
  fonte: string;
}

export interface SimboloGlobal {
  codigo: string;
  yahoo: string;
  nome: string;
  tipo: TipoCatalogo;
  mercado: AtivoCatalogo['mercado'];
  moeda: AtivoCatalogo['moeda'];
  setor?: string;
}

const indice = (codigo: string, yahoo: string, nome: string, mercado: AtivoCatalogo['mercado'] = 'Global'): SimboloGlobal =>
  ({ codigo, yahoo, nome, tipo: 'indice', mercado, moeda: 'PTS' });
const eua = (codigo: string, nome: string, setor: string): SimboloGlobal =>
  ({ codigo, yahoo: codigo, nome, tipo: 'acao_exterior', mercado: 'EUA', moeda: 'USD', setor });

/** Índices, moedas, cripto, commodities e as ações dos EUA mais acompanhadas. */
export const SIMBOLOS_GLOBAIS: SimboloGlobal[] = [
  indice('IBOV', '^BVSP', 'Ibovespa', 'B3'),
  indice('SP500', '^GSPC', 'S&P 500', 'EUA'),
  indice('DJI', '^DJI', 'Dow Jones', 'EUA'),
  indice('NASDAQ', '^IXIC', 'Nasdaq Composite', 'EUA'),
  indice('RUSSELL', '^RUT', 'Russell 2000', 'EUA'),
  indice('VIX', '^VIX', 'VIX (volatilidade)', 'EUA'),
  indice('FTSE', '^FTSE', 'FTSE 100 (Londres)'),
  indice('DAX', '^GDAXI', 'DAX (Frankfurt)'),
  indice('STOXX50', '^STOXX50E', 'Euro Stoxx 50'),
  indice('NIKKEI', '^N225', 'Nikkei 225 (Tóquio)'),
  indice('HANGSENG', '^HSI', 'Hang Seng (Hong Kong)'),
  { codigo: 'US10Y', yahoo: '^TNX', nome: 'Juros 10 anos EUA (%)', tipo: 'indice', mercado: 'EUA', moeda: 'PTS' },
  { codigo: 'USDBRL', yahoo: 'BRL=X', nome: 'Dólar', tipo: 'moeda', mercado: 'Global', moeda: 'BRL' },
  { codigo: 'EURBRL', yahoo: 'EURBRL=X', nome: 'Euro', tipo: 'moeda', mercado: 'Global', moeda: 'BRL' },
  { codigo: 'GBPBRL', yahoo: 'GBPBRL=X', nome: 'Libra', tipo: 'moeda', mercado: 'Global', moeda: 'BRL' },
  { codigo: 'EURUSD', yahoo: 'EURUSD=X', nome: 'Euro em dólar', tipo: 'moeda', mercado: 'Global', moeda: 'USD' },
  { codigo: 'BTC', yahoo: 'BTC-USD', nome: 'Bitcoin', tipo: 'cripto', mercado: 'Global', moeda: 'USD' },
  { codigo: 'ETH', yahoo: 'ETH-USD', nome: 'Ethereum', tipo: 'cripto', mercado: 'Global', moeda: 'USD' },
  { codigo: 'SOL', yahoo: 'SOL-USD', nome: 'Solana', tipo: 'cripto', mercado: 'Global', moeda: 'USD' },
  { codigo: 'OURO', yahoo: 'GC=F', nome: 'Ouro (onça)', tipo: 'commodity', mercado: 'Global', moeda: 'USD' },
  { codigo: 'PRATA', yahoo: 'SI=F', nome: 'Prata (onça)', tipo: 'commodity', mercado: 'Global', moeda: 'USD' },
  { codigo: 'BRENT', yahoo: 'BZ=F', nome: 'Petróleo Brent (barril)', tipo: 'commodity', mercado: 'Global', moeda: 'USD' },
  { codigo: 'WTI', yahoo: 'CL=F', nome: 'Petróleo WTI (barril)', tipo: 'commodity', mercado: 'Global', moeda: 'USD' },
  eua('AAPL', 'Apple', 'Tecnologia'),
  eua('MSFT', 'Microsoft', 'Tecnologia'),
  eua('NVDA', 'Nvidia', 'Tecnologia'),
  eua('GOOGL', 'Alphabet (Google)', 'Tecnologia'),
  eua('AMZN', 'Amazon', 'Varejo'),
  eua('META', 'Meta (Facebook)', 'Tecnologia'),
  eua('TSLA', 'Tesla', 'Automóveis'),
  eua('NFLX', 'Netflix', 'Mídia'),
  eua('AMD', 'AMD', 'Tecnologia'),
  eua('INTC', 'Intel', 'Tecnologia'),
  eua('BRK-B', 'Berkshire Hathaway', 'Financeiro'),
  eua('JPM', 'JPMorgan Chase', 'Financeiro'),
  eua('V', 'Visa', 'Financeiro'),
  eua('MA', 'Mastercard', 'Financeiro'),
  eua('KO', 'Coca-Cola', 'Bebidas'),
  eua('PEP', 'PepsiCo', 'Bebidas'),
  eua('MCD', "McDonald's", 'Restaurantes'),
  eua('DIS', 'Disney', 'Mídia'),
  eua('NKE', 'Nike', 'Vestuário'),
  eua('WMT', 'Walmart', 'Varejo'),
  eua('JNJ', 'Johnson & Johnson', 'Saúde'),
  eua('PFE', 'Pfizer', 'Saúde'),
  eua('XOM', 'ExxonMobil', 'Petróleo'),
  eua('BA', 'Boeing', 'Aviação'),
  eua('UBER', 'Uber', 'Transporte'),
  eua('SPY', 'SPDR S&P 500 ETF', 'ETF'),
  eua('QQQ', 'Invesco QQQ (Nasdaq 100)', 'ETF'),
];

export const simboloYahoo = (codigo: string) =>
  SIMBOLOS_GLOBAIS.find((s) => s.codigo === codigo)?.yahoo
  ?? SIMBOLOS_MERCADO.find((s) => s.codigo === codigo)?.yahoo
  ?? `${codigo}.SA`;

export const URL_BRAPI_LISTA = (pagina: number, token: string) =>
  `https://brapi.dev/api/quote/list?limit=2000&page=${pagina}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

type ItemBrapi = {
  stock?: string; name?: string; close?: number | null; change?: number | null; volume?: number | null;
  market_cap?: number | null; logo?: string | null; sector?: string | null; type?: string;
};

/**
 * A brapi chama FII, ETF, Fiagro etc. de "fund". O nome do fundo diz o que ele é.
 * Códigos terminados em F são do mercado fracionário: ficam de fora (duplicam o lote padrão).
 */
export function classificarB3(item: ItemBrapi): TipoCatalogo | null {
  const codigo = item.stock ?? '';
  if (!/^[A-Z0-9]{4}\d{1,2}$/.test(codigo)) return null;
  if (item.type === 'bdr') return 'bdr';
  if (item.type === 'fund') {
    const nome = (item.name ?? '').toUpperCase();
    if (/IMOBILI|FII\b|FIAGRO/.test(nome)) return 'fii';
    if (/[ÍI]NDICE|ETF|ISHARES|IT NOW|TREND|INVESTO|HASHDEX/.test(nome)) return 'etf';
    return 'fundo';
  }
  if (item.type === 'stock') return 'acao';
  return null;
}

const SETORES: Record<string, string> = {
  'Retail Trade': 'Varejo', 'Energy Minerals': 'Petróleo e gás', 'Health Services': 'Saúde', Utilities: 'Energia e saneamento',
  Finance: 'Financeiro', 'Consumer Services': 'Serviços ao consumidor', 'Consumer Non-Durables': 'Consumo', 'Non-Energy Minerals': 'Mineração e siderurgia',
  'Commercial Services': 'Serviços', 'Distribution Services': 'Distribuição', Transportation: 'Transporte', 'Technology Services': 'Tecnologia',
  'Process Industries': 'Indústria de base', Communications: 'Telecomunicações', 'Producer Manufacturing': 'Indústria', Miscellaneous: 'Diversos',
  'Electronic Technology': 'Tecnologia', 'Industrial Services': 'Serviços industriais', 'Health Technology': 'Saúde', 'Consumer Durables': 'Bens duráveis',
};

/** Converte uma página de /api/quote/list da brapi em linhas do catálogo. */
export function lerListaBrapi(json: unknown): AtivoCatalogo[] {
  const itens = (json as { stocks?: ItemBrapi[] })?.stocks;
  if (!Array.isArray(itens)) throw new Error('brapi: lista sem "stocks"');
  const saida: AtivoCatalogo[] = [];
  for (const i of itens) {
    const tipo = classificarB3(i);
    if (!tipo) continue;
    const nome = (i.name ?? '').replace(/\s+-\s+RESPONSABILIDADE LIMITADA$/i, '').replace(/\s+/g, ' ').trim() || i.stock!;
    saida.push({
      codigo: i.stock!, nome: nome.slice(0, 200), tipo, mercado: 'B3', moeda: 'BRL',
      setor: i.sector ? (SETORES[i.sector] ?? i.sector) : null,
      logo_url: i.logo && /^https:\/\//.test(i.logo) ? i.logo : null,
      preco: i.close && i.close > 0 ? i.close : null,
      variacao: Number.isFinite(i.change) ? Number(i.change) : null,
      volume: i.volume && i.volume > 0 ? Math.round(i.volume) : null,
      valor_mercado: i.market_cap && i.market_cap > 0 ? i.market_cap : null,
      fonte: 'brapi',
    });
  }
  return saida;
}

/** Último preço e variação do dia a partir do histórico curto (5 pregões) do Yahoo. */
export function resumoDosCandles(candles: Candle[]): { preco: number; variacao: number | null; volume: number | null } {
  const ultimo = candles[candles.length - 1];
  const anterior = candles[candles.length - 2];
  return {
    preco: ultimo.fechamento,
    variacao: anterior ? ((ultimo.fechamento - anterior.fechamento) / anterior.fechamento) * 100 : null,
    volume: ultimo.volume || null,
  };
}

/* ------------------------------------------------------------------ */
/* Candles                                                             */
/* ------------------------------------------------------------------ */

export interface Candle {
  data: string; // AAAA-MM-DD, no fuso da bolsa
  abertura: number;
  maxima: number;
  minima: number;
  fechamento: number;
  volume: number;
}

export const urlYahooHistorico = (simbolo: string, periodo: '5d' | '1mo' | '6mo' | '2y' | '5y') =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=${periodo}&interval=1d`;

/**
 * Lê o histórico diário do Yahoo. Descarta candles incompletos ou incoerentes
 * (máxima abaixo da mínima, preço zero): melhor um buraco que um dado errado.
 */
export function lerYahooHistorico(json: unknown): Candle[] {
  const r = (json as {
    chart?: { result?: { meta?: { gmtoffset?: number }; timestamp?: number[]; indicators?: { quote?: Record<string, (number | null)[]>[] } }[] };
  })?.chart?.result?.[0];
  const ts = r?.timestamp;
  const q = r?.indicators?.quote?.[0];
  if (!ts || !q) throw new Error('Yahoo: histórico sem dados');
  const deslocamento = (r?.meta?.gmtoffset ?? -10800) * 1000;
  const porData = new Map<string, Candle>();
  ts.forEach((t, i) => {
    const [a, h, l, c] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]];
    if ([a, h, l, c].some((v) => v === null || v === undefined || !(v > 0))) return;
    if (h! < l! || h! < Math.max(a!, c!) * 0.999 || l! > Math.min(a!, c!) * 1.001) return;
    const data = new Date(t * 1000 + deslocamento).toISOString().slice(0, 10);
    porData.set(data, { data, abertura: a!, maxima: h!, minima: l!, fechamento: c!, volume: Math.max(0, Math.round(q.volume?.[i] ?? 0)) });
  });
  const candles = [...porData.values()].sort((x, y) => x.data.localeCompare(y.data));
  if (candles.length === 0) throw new Error('Yahoo: nenhum candle válido');
  return candles;
}

export async function historicoYahoo(codigo: string, periodo: '5d' | '1mo' | '6mo' | '2y' | '5y'): Promise<Candle[]> {
  const texto = await (await buscar(urlYahooHistorico(simboloYahoo(codigo), periodo), { tentativas: 2, headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  return lerYahooHistorico(JSON.parse(texto));
}

/* ------------------------------------------------------------------ */
/* Notícias (RSS)                                                      */
/* ------------------------------------------------------------------ */

export interface FonteNoticia {
  nome: string;
  url: string;
}

export const FONTES_NOTICIAS: FonteNoticia[] = [
  { nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml' },
  { nome: 'g1 Economia', url: 'https://g1.globo.com/rss/g1/economia/' },
  { nome: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/' },
];

export interface Noticia {
  url: string;
  titulo: string;
  resumo: string | null;
  imagemUrl: string | null;
  fonte: string;
  publicadoEm: string; // ISO
}

/** Assuntos que aparecem nos feeds de economia mas não interessam a quem investe. */
const FORA_DO_ASSUNTO = /mega-sena|lotof[aá]cil|quina|loteria|timemania|dupla sena|\+milion[aá]ria/i;

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodificar(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
}

const semCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

function campo(item: string, ...tags: string[]): string | null {
  for (const tag of tags) {
    const m = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
    if (m) return semCdata(m[1]).trim();
  }
  return null;
}

/** Texto limpo: sem HTML, entidades resolvidas, espaços normalizados, até `max` caracteres. */
export function textoLimpo(html: string, max = 220): string {
  // Primeiro tira as tags de verdade (atributos podem trazer HTML codificado, como
  // data-image-caption do InfoMoney); depois decodifica e tira as tags que
  // vinham codificadas no texto (Agência Brasil); por fim decodifica o que sobrou.
  const semTags = (s: string) => s.replace(/<[^>]*>/g, ' ');
  const t = decodificar(semTags(decodificar(semTags(semCdata(html))))).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, t.lastIndexOf(' ', max - 1) > 0 ? t.lastIndexOf(' ', max - 1) : max).trim()}…`;
}

function imagemDoItem(item: string, descricaoBruta: string): string | null {
  const direta = campo(item, 'imagem-destaque');
  if (direta && /^https:\/\//.test(direta)) return direta;
  const media = item.match(/<media:(?:content|thumbnail)[^>]+url="([^"]+)"/i)?.[1];
  if (media && /^https:\/\//.test(media)) return decodificar(media);
  const img = decodificar(descricaoBruta).match(/<img[^>]+src="(https:\/\/[^"]+)"/i)?.[1];
  // Ignora pixels de rastreamento (imagens 1×1 de contagem de acesso).
  if (img && !/\.(gif|png)\?id=|ebc\.(png|gif)/i.test(img)) return decodificar(img);
  return null;
}

export function lerRSS(xml: string, fonte: string, agora = new Date()): Noticia[] {
  const itens = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const noticias: Noticia[] = [];
  for (const item of itens) {
    const titulo = campo(item, 'title');
    const link = campo(item, 'link') ?? campo(item, 'guid');
    if (!titulo || !link || !/^https:\/\//.test(decodificar(link))) continue;
    const tituloLimpo = textoLimpo(titulo, 200);
    if (FORA_DO_ASSUNTO.test(tituloLimpo)) continue;
    const descricao = campo(item, 'description') ?? '';
    const subtitulo = campo(item, 'atom:subtitle');
    // Feeds WordPress terminam com "The post X appeared first on Y": não é resumo.
    const resumo = textoLimpo((subtitulo ?? descricao).replace(/(&lt;p&gt;|<p>)?\s*The post\b[\s\S]*$/i, '')) || null;
    const data = campo(item, 'pubDate', 'dc:date', 'published', 'updated');
    const publicado = data ? new Date(data) : agora;
    noticias.push({
      url: decodificar(link),
      titulo: tituloLimpo,
      resumo: resumo && resumo !== tituloLimpo ? resumo : null,
      imagemUrl: imagemDoItem(item, descricao),
      fonte,
      publicadoEm: (Number.isNaN(publicado.getTime()) || publicado > agora ? agora : publicado).toISOString(),
    });
  }
  return noticias;
}

export async function noticiasDaFonte(f: FonteNoticia): Promise<Noticia[]> {
  const xml = await (await buscar(f.url, { tentativas: 2, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/rss+xml, application/xml, text/xml' } })).text();
  const n = lerRSS(xml, f.nome);
  if (n.length === 0) throw new Error(`${f.nome}: feed sem itens`);
  return n;
}
