/**
 * Fontes públicas e gratuitas de dados de mercado, com redundância.
 *
 * Este módulo não depende do Deno nem do Supabase: só `fetch`. Assim os
 * parsers são testados pelo Vitest (fontes.test.ts) e usados pelo coletor.
 *
 * Ordem de confiança de cada dado (a primeira que responder e passar na
 * validação vence; se todas falharem, o coletor mantém o último valor salvo
 * e o marca como desatualizado):
 *   Selic meta ........ BCB SGS 432 → (último valor salvo)
 *   CDI anual ......... BCB SGS 4389 → calculado do CDI diário (SGS 12)
 *   CDI/Selic diários . BCB SGS 12 / 11
 *   IPCA mês .......... BCB SGS 433 → IBGE SIDRA 1737 (v63)
 *   IPCA 12 meses ..... BCB SGS 13522 → IBGE SIDRA 1737 (v2265)
 *   Dólar PTAX ........ BCB Olinda PTAX → BCB SGS 1
 *   IPCA esperado ..... BCB Olinda Expectativas (Focus, mediana 12 meses)
 *   Tesouro Direto .... Tesouro Transparente (CSV oficial de preços e taxas)
 *   ETFs .............. brapi.dev (token gratuito) → Yahoo Finance
 */

export interface Ponto {
  data: string; // AAAA-MM-DD
  valor: number;
}

export interface Leitura {
  codigo: string;
  nome: string;
  valor: number;
  unidade: string;
  dataReferencia: string;
  fonte: string;
  fonteUrl: string;
  historico?: Ponto[];
}

export interface Cotacao {
  codigo: string;
  preco: number;
  data: string;
  fonte: string;
}

export interface TituloTesouro {
  tipo: string;
  vencimento: string;
  dataBase: string;
  taxaCompra: number | null;
  taxaVenda: number | null;
  puCompra: number | null;
  puVenda: number;
}

/* ------------------------------------------------------------------ */
/* Validação: nenhum número absurdo entra no banco                     */
/* ------------------------------------------------------------------ */

export const LIMITES: Record<string, [number, number]> = {
  selic_meta: [0, 50],
  cdi_anual: [0, 50],
  cdi_diario: [0, 0.2],
  selic_diaria: [0, 0.2],
  ipca_mes: [-5, 5],
  ipca_12m: [-10, 60],
  dolar_ptax: [1, 30],
  focus_ipca_12m: [-5, 40],
  juro_real: [-30, 40],
  juro_real_esperado: [-30, 40],
};

export function valorPlausivel(codigo: string, valor: number): boolean {
  if (!Number.isFinite(valor)) return false;
  const limite = LIMITES[codigo];
  return !limite || (valor >= limite[0] && valor <= limite[1]);
}

/** Variação maior que isso entre dois preços seguidos exige confirmação por outra fonte. */
export const SALTO_SUSPEITO = 0.25;

export function precoConfere(a: number, b: number, tolerancia = 0.02): boolean {
  return Math.abs(a - b) / Math.max(a, b) <= tolerancia;
}

/* ------------------------------------------------------------------ */
/* HTTP com tempo limite e novas tentativas                             */
/* ------------------------------------------------------------------ */

export interface OpcoesBusca {
  tentativas?: number;
  tempoLimiteMs?: number;
  headers?: Record<string, string>;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function buscar(url: string, o: OpcoesBusca = {}): Promise<Response> {
  const tentativas = o.tentativas ?? 3;
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), o.tempoLimiteMs ?? 20_000);
    try {
      const r = await fetch(url, {
        headers: { Accept: 'application/json, text/csv, */*', 'User-Agent': 'Investindo/0.1 (projeto academico)', ...o.headers },
        signal: controle.signal,
      });
      if (r.ok) return r;
      ultimoErro = new Error(`HTTP ${r.status} em ${url.split('?')[0]}`);
      if (r.status >= 400 && r.status < 500 && r.status !== 429) break; // erro do pedido: não adianta repetir
    } catch (e) {
      ultimoErro = e;
    } finally {
      clearTimeout(timer);
    }
    if (i < tentativas - 1) await esperar(1000 * 2 ** i);
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro));
}

/**
 * Como `buscar`, mas também tenta de novo quando a resposta chega com status 200
 * e não é JSON (o BCB às vezes devolve uma página de erro em XML/HTML).
 */
async function buscarJson<T>(url: string, o: OpcoesBusca = {}): Promise<T> {
  const tentativas = o.tentativas ?? 3;
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      const texto = await (await buscar(url, { ...o, tentativas: 1 })).text();
      try {
        return JSON.parse(texto) as T;
      } catch {
        throw new Error(`resposta não é JSON em ${url.split('?')[0]}`);
      }
    } catch (e) {
      ultimoErro = e;
      if (i < tentativas - 1) await esperar(1000 * 2 ** i);
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro));
}

/* ------------------------------------------------------------------ */
/* Datas                                                               */
/* ------------------------------------------------------------------ */

export const brParaISO = (d: string) => {
  const [dia, mes, ano] = d.split('/');
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
};
export const isoParaBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const isoParaEUA = (iso: string) => `${iso.slice(5, 7)}-${iso.slice(8, 10)}-${iso.slice(0, 4)}`;
export const diasAtras = (hoje: string, dias: number) => {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
};
const numeroBR = (s: string | undefined | null): number | null => {
  if (s === undefined || s === null || s.trim() === '') return null;
  const n = Number(s.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/* ------------------------------------------------------------------ */
/* Banco Central — SGS                                                 */
/* ------------------------------------------------------------------ */

export const urlSGS = (serie: number, de: string, ate: string) =>
  `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados?formato=json&dataInicial=${isoParaBR(de)}&dataFinal=${isoParaBR(ate)}`;

export function lerSGS(json: unknown): Ponto[] {
  if (!Array.isArray(json)) throw new Error('SGS: resposta inesperada');
  return json
    .map((l: { data?: string; valor?: string }) => ({ data: brParaISO(String(l.data)), valor: Number(l.valor) }))
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.data) && Number.isFinite(p.valor))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** Busca uma série do SGS sempre com janela de datas (a API recusa consultas sem data). */
export async function serieSGS(serie: number, de: string, ate: string): Promise<Ponto[]> {
  const pontos = lerSGS(await buscarJson(urlSGS(serie, de, ate)));
  if (pontos.length === 0) throw new Error(`SGS ${serie}: sem dados no período`);
  return pontos;
}

const ultimo = (p: Ponto[]) => p[p.length - 1];

/* ------------------------------------------------------------------ */
/* Banco Central — Olinda (PTAX e Focus)                               */
/* ------------------------------------------------------------------ */

export const urlPTAX = (de: string, ate: string) =>
  `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
  `?@dataInicial='${isoParaEUA(de)}'&@dataFinalCotacao='${isoParaEUA(ate)}'&$format=json&$select=cotacaoVenda,dataHoraCotacao`;

export function lerPTAX(json: unknown): Ponto {
  const valores = (json as { value?: { cotacaoVenda: number; dataHoraCotacao: string }[] })?.value;
  if (!Array.isArray(valores) || valores.length === 0) throw new Error('PTAX: sem cotação no período');
  const ult = [...valores].sort((a, b) => a.dataHoraCotacao.localeCompare(b.dataHoraCotacao)).pop()!;
  return { data: ult.dataHoraCotacao.slice(0, 10), valor: Number(ult.cotacaoVenda) };
}

export const URL_FOCUS =
  "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoInflacao12Meses" +
  "?$top=20&$filter=Indicador%20eq%20'IPCA'%20and%20Suavizada%20eq%20'S'&$orderby=Data%20desc&$format=json" +
  '&$select=Indicador,Data,Suavizada,Mediana,baseCalculo';

export function lerFocus(json: unknown): Ponto {
  const v = (json as { value?: { Data: string; Mediana: number; baseCalculo: number }[] })?.value;
  if (!Array.isArray(v) || v.length === 0) throw new Error('Focus: sem dados');
  // baseCalculo 0 = respostas dos últimos 30 dias (a série oficial do boletim).
  const escolhido = v.find((l) => l.baseCalculo === 0) ?? v[0];
  return { data: escolhido.Data.slice(0, 10), valor: Number(escolhido.Mediana) };
}

/* ------------------------------------------------------------------ */
/* IBGE — SIDRA (redundância do IPCA, produtor oficial do índice)      */
/* ------------------------------------------------------------------ */

/** Variável 63 = IPCA do mês; 2265 = acumulado em 12 meses. */
export const urlSIDRA = (variavel: 63 | 2265) =>
  `https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/${variavel}/p/last%201`;

export function lerSIDRA(json: unknown): Ponto {
  if (!Array.isArray(json) || json.length < 2) throw new Error('SIDRA: resposta inesperada');
  const linha = json[1] as { V?: string; D3C?: string };
  const valor = Number(linha.V);
  const periodo = String(linha.D3C ?? '');
  if (!Number.isFinite(valor) || !/^\d{6}$/.test(periodo)) throw new Error('SIDRA: valor inválido');
  return { data: `${periodo.slice(0, 4)}-${periodo.slice(4, 6)}-01`, valor };
}

/* ------------------------------------------------------------------ */
/* Tesouro Transparente — CSV oficial de preços e taxas                */
/* ------------------------------------------------------------------ */

export const URL_TESOURO_CSV =
  'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv';

/**
 * Lê o CSV (separador ";", decimais com vírgula, datas dd/mm/aaaa) e devolve só
 * os títulos da data-base mais recente.
 */
export function lerTesouroCSV(csv: string): TituloTesouro[] {
  const linhas = csv.split(/\r?\n/);
  const cabecalho = linhas[0].replace(/^﻿/, '').split(';').map((c) => c.trim().toLowerCase());
  const col = (nome: string) => {
    const i = cabecalho.findIndex((c) => c.startsWith(nome));
    if (i < 0) throw new Error(`Tesouro CSV: coluna "${nome}" não encontrada`);
    return i;
  };
  const iTipo = col('tipo titulo');
  const iVenc = col('data vencimento');
  const iBase = col('data base');
  const iTxC = col('taxa compra');
  const iTxV = col('taxa venda');
  const iPuC = col('pu compra');
  const iPuV = col('pu venda');

  let maisRecente = '';
  let titulos: TituloTesouro[] = [];
  for (let n = 1; n < linhas.length; n++) {
    const c = linhas[n].split(';');
    if (c.length <= iPuV) continue;
    const dataBase = brParaISO(c[iBase].trim());
    if (dataBase < maisRecente) continue;
    const puVenda = numeroBR(c[iPuV]);
    if (!puVenda || puVenda <= 0) continue;
    if (dataBase > maisRecente) {
      maisRecente = dataBase;
      titulos = [];
    }
    titulos.push({
      tipo: c[iTipo].trim(),
      vencimento: brParaISO(c[iVenc].trim()),
      dataBase,
      taxaCompra: numeroBR(c[iTxC]),
      taxaVenda: numeroBR(c[iTxV]),
      puCompra: numeroBR(c[iPuC]),
      puVenda,
    });
  }
  if (titulos.length === 0) throw new Error('Tesouro CSV: nenhum título lido');
  return titulos;
}

/** Código estável no catálogo e nome amigável ("Tesouro IPCA+ 2035"). */
export function identificarTitulo(t: Pick<TituloTesouro, 'tipo' | 'vencimento'>) {
  const ano = t.vencimento.slice(0, 4);
  const tipo = t.tipo;
  const indexador = /selic/i.test(tipo) ? 'selic' : /ipca/i.test(tipo) ? 'ipca' : /prefixado/i.test(tipo) ? 'pre' : 'nenhum';
  const classe = indexador === 'selic' ? 'reserva' : 'renda_fixa';
  return { codigo: `${tipo}|${t.vencimento}`, nome: `${tipo} ${ano}`, indexador, classe } as const;
}

/* ------------------------------------------------------------------ */
/* Cotações de ETFs                                                    */
/* ------------------------------------------------------------------ */

export const urlBrapi = (codigo: string, token: string) =>
  `https://brapi.dev/api/quote/${encodeURIComponent(codigo)}?token=${encodeURIComponent(token)}`;

export function lerBrapi(json: unknown, codigo: string): Cotacao {
  const r = (json as { results?: { symbol: string; regularMarketPrice: number; regularMarketTime?: string }[] })?.results?.find(
    (x) => x.symbol?.toUpperCase() === codigo.toUpperCase(),
  );
  if (!r || !(r.regularMarketPrice > 0)) throw new Error(`brapi: sem preço para ${codigo}`);
  const data = r.regularMarketTime ? new Date(r.regularMarketTime).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  return { codigo, preco: r.regularMarketPrice, data, fonte: 'brapi.dev' };
}

export const urlYahoo = (codigo: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(codigo)}.SA?range=5d&interval=1d`;

export function lerYahoo(json: unknown, codigo: string): Cotacao {
  const meta = (json as { chart?: { result?: { meta?: { regularMarketPrice?: number; regularMarketTime?: number; currency?: string } }[] } })
    ?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice || meta.regularMarketPrice <= 0) throw new Error(`Yahoo: sem preço para ${codigo}`);
  if (meta.currency && meta.currency !== 'BRL') throw new Error(`Yahoo: moeda inesperada ${meta.currency}`);
  const data = new Date((meta.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10);
  return { codigo, preco: meta.regularMarketPrice, data, fonte: 'Yahoo Finance' };
}

export async function cotacaoBrapi(codigo: string, token: string): Promise<Cotacao> {
  if (!token) throw new Error('brapi: BRAPI_TOKEN não configurado');
  return lerBrapi(await buscarJson(urlBrapi(codigo, token), { tentativas: 2 }), codigo);
}

export async function cotacaoYahoo(codigo: string): Promise<Cotacao> {
  return lerYahoo(await buscarJson(urlYahoo(codigo), { tentativas: 2, headers: { 'User-Agent': 'Mozilla/5.0' } }), codigo);
}

/* ------------------------------------------------------------------ */
/* Indicadores com cadeia de fontes                                    */
/* ------------------------------------------------------------------ */

export type Tentativa = () => Promise<Leitura>;

export interface ResultadoIndicador {
  codigo: string;
  leitura: Leitura | null;
  erros: string[];
}

/** Tenta cada fonte em ordem; a primeira que trouxer valor plausível vence. */
export async function primeiraQueResponde(codigo: string, tentativas: Tentativa[]): Promise<ResultadoIndicador> {
  const erros: string[] = [];
  for (const t of tentativas) {
    try {
      const l = await t();
      if (!valorPlausivel(codigo, l.valor)) {
        erros.push(`${l.fonte}: valor fora do esperado (${l.valor})`);
        continue;
      }
      return { codigo, leitura: l, erros };
    } catch (e) {
      erros.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { codigo, leitura: null, erros };
}

const SGS_URL_PUBLICA = (serie: number) => `https://www3.bcb.gov.br/sgspub/consultarvalores/consultarValoresSeries.do?method=consultarValores&optSelecionaSerie=${serie}`;

/** Monta as cadeias de fontes de todos os indicadores do painel. */
export function cadeiasIndicadores(hoje: string): Record<string, Tentativa[]> {
  const ha = (d: number) => diasAtras(hoje, d);
  const sgs = (codigo: string, nome: string, serie: number, unidade: string, janela: number, guardarHistorico = false): Tentativa => async () => {
    const pontos = await serieSGS(serie, ha(janela), hoje);
    const u = ultimo(pontos);
    return {
      codigo, nome, unidade, valor: u.valor, dataReferencia: u.data,
      fonte: `Banco Central · SGS ${serie}`, fonteUrl: SGS_URL_PUBLICA(serie),
      historico: guardarHistorico ? pontos : [u],
    };
  };

  return {
    selic_meta: [sgs('selic_meta', 'Selic (meta)', 432, '% a.a.', 30)],
    cdi_anual: [
      sgs('cdi_anual', 'CDI', 4389, '% a.a.', 15),
      async () => {
        const p = await serieSGS(12, ha(15), hoje);
        const u = ultimo(p);
        return {
          codigo: 'cdi_anual', nome: 'CDI', unidade: '% a.a.', dataReferencia: u.data,
          valor: Math.round((Math.pow(1 + u.valor / 100, 252) - 1) * 10000) / 100,
          fonte: 'Banco Central · SGS 12 (anualizado)', fonteUrl: SGS_URL_PUBLICA(12),
        };
      },
    ],
    cdi_diario: [sgs('cdi_diario', 'CDI diário', 12, '% a.d.', 40, true)],
    selic_diaria: [sgs('selic_diaria', 'Selic diária', 11, '% a.d.', 40, true)],
    ipca_mes: [
      sgs('ipca_mes', 'IPCA do mês', 433, '% a.m.', 800, true),
      async () => {
        const p = lerSIDRA(await buscarJson(urlSIDRA(63)));
        return { codigo: 'ipca_mes', nome: 'IPCA do mês', unidade: '% a.m.', valor: p.valor, dataReferencia: p.data, fonte: 'IBGE · SIDRA 1737', fonteUrl: 'https://sidra.ibge.gov.br/tabela/1737' };
      },
    ],
    ipca_12m: [
      sgs('ipca_12m', 'IPCA 12 meses', 13522, '%', 120),
      async () => {
        const p = lerSIDRA(await buscarJson(urlSIDRA(2265)));
        return { codigo: 'ipca_12m', nome: 'IPCA 12 meses', unidade: '%', valor: p.valor, dataReferencia: p.data, fonte: 'IBGE · SIDRA 1737', fonteUrl: 'https://sidra.ibge.gov.br/tabela/1737' };
      },
    ],
    dolar_ptax: [
      async () => {
        const p = lerPTAX(await buscarJson(urlPTAX(ha(10), hoje)));
        return { codigo: 'dolar_ptax', nome: 'Dólar (PTAX venda)', unidade: 'R$', valor: p.valor, dataReferencia: p.data, fonte: 'Banco Central · PTAX', fonteUrl: 'https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes' };
      },
      sgs('dolar_ptax', 'Dólar (venda)', 1, 'R$', 15),
    ],
    focus_ipca_12m: [
      async () => {
        const p = lerFocus(await buscarJson(URL_FOCUS));
        return { codigo: 'focus_ipca_12m', nome: 'IPCA esperado 12 meses (Focus)', unidade: '%', valor: p.valor, dataReferencia: p.data, fonte: 'Banco Central · Focus', fonteUrl: 'https://www.bcb.gov.br/publicacoes/focus' };
      },
    ],
  };
}

/** Juro real pela equação de Fisher, em %. */
export const fisher = (nominal: number, inflacao: number) =>
  Math.round(((1 + nominal / 100) / (1 + inflacao / 100) - 1) * 10000) / 100;
