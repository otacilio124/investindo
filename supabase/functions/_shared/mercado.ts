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

export const simboloYahoo = (codigo: string) =>
  SIMBOLOS_MERCADO.find((s) => s.codigo === codigo)?.yahoo ?? `${codigo}.SA`;

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

export const urlYahooHistorico = (simbolo: string, periodo: '5d' | '1mo' | '6mo' | '2y') =>
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

export async function historicoYahoo(codigo: string, periodo: '5d' | '1mo' | '6mo' | '2y'): Promise<Candle[]> {
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
