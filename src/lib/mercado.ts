import { ehDiaUtil, somarDias } from '../domain/calendario';
import { hojeSP } from './formato';
import { supabase } from './supabase';

export interface Candle {
  data: string;
  abertura: number;
  maxima: number;
  minima: number;
  fechamento: number;
  volume: number;
}

export type TipoMercado = 'acao' | 'fii' | 'etf' | 'fundo' | 'bdr' | 'indice' | 'acao_exterior' | 'moeda' | 'cripto' | 'commodity';

export interface AtivoMercado {
  codigo: string;
  nome: string;
  tipo: TipoMercado;
  /** Prefixo do preço na tela: pontos para índices, R$ ou US$ para o resto. */
  unidade: 'pts' | 'R$' | 'US$';
  logo?: string | null;
  setor?: string | null;
}

export const NOME_TIPO: Record<TipoMercado, string> = {
  acao: 'Ação', fii: 'Fundo imobiliário', etf: 'ETF', fundo: 'Fundo', bdr: 'BDR', indice: 'Índice',
  acao_exterior: 'Ação EUA', moeda: 'Moeda', cripto: 'Cripto', commodity: 'Commodity',
};

/** Painel fixo do mercado; os ETFs da pessoa entram junto. */
export const PAINEL_MERCADO: AtivoMercado[] = [
  { codigo: 'IBOV', nome: 'Ibovespa', tipo: 'indice', unidade: 'pts' },
  { codigo: 'USDBRL', nome: 'Dólar', tipo: 'moeda', unidade: 'R$' },
  { codigo: 'SP500', nome: 'S&P 500', tipo: 'indice', unidade: 'pts' },
];

export interface ResumoAtivo extends AtivoMercado {
  ultimo: number;
  anterior: number | null;
  variacao: number; // %
  data: string;
  /** Fechamentos dos últimos ~30 pregões, para o minigráfico. */
  serie: number[];
}

type LinhaCandle = { codigo: string; data: string; abertura: number; maxima: number; minima: number; fechamento: number; volume: number };

const paraCandle = (l: LinhaCandle): Candle => ({
  data: l.data, abertura: Number(l.abertura), maxima: Number(l.maxima), minima: Number(l.minima),
  fechamento: Number(l.fechamento), volume: Number(l.volume),
});

/**
 * Candles diários. Lê do banco; se o ativo ainda não tem histórico ou está
 * atrasado (ativo do catálogo que ninguém abriu), pede à função "historico",
 * que busca na fonte, grava e devolve. Se a função falhar, fica o que há salvo.
 */
export async function carregarCandles(codigo: string, anos = 2): Promise<Candle[]> {
  const hoje = hojeSP();
  const desde = somarDias(hoje, -Math.round(anos * 366));
  const { data, error } = await supabase
    .from('cotacao_diaria')
    .select('codigo, data, abertura, maxima, minima, fechamento, volume')
    .eq('codigo', codigo).gte('data', desde).order('data').limit(1000);
  if (error) throw new Error(error.message);
  const salvos = (data as LinhaCandle[]).map(paraCandle);

  const ultimo = salvos[salvos.length - 1]?.data;
  const atrasado = !ultimo || ultimo < somarDias(hoje, -4);
  const curto = anos <= 2 && salvos.length > 0 && salvos[0].data > somarDias(desde, 45);
  if (!atrasado && !curto) return salvos;

  const r = await supabase.functions.invoke<{ candles: LinhaCandle[] }>('historico', { body: { codigo } }).catch(() => null);
  const novos = r?.data?.candles?.map(paraCandle).filter((c) => c.data >= desde);
  return novos && novos.length >= salvos.length ? novos : salvos;
}

export async function carregarResumoMercado(ativos: AtivoMercado[]): Promise<ResumoAtivo[]> {
  const { data, error } = await supabase
    .from('cotacao_diaria')
    .select('codigo, data, fechamento')
    .in('codigo', ativos.map((a) => a.codigo))
    .gte('data', somarDias(hojeSP(), -50))
    .order('data').limit(1000);
  if (error) throw new Error(error.message);
  const linhas = data as { codigo: string; data: string; fechamento: number }[];
  return ativos.flatMap((a) => {
    const s = linhas.filter((l) => l.codigo === a.codigo);
    if (s.length === 0) return [];
    const ultimo = Number(s[s.length - 1].fechamento);
    const anterior = s.length > 1 ? Number(s[s.length - 2].fechamento) : null;
    return [{
      ...a, ultimo, anterior, data: s[s.length - 1].data,
      variacao: anterior ? ((ultimo - anterior) / anterior) * 100 : 0,
      serie: s.slice(-30).map((l) => Number(l.fechamento)),
    }];
  });
}

/** Fechamentos diários por código, para avaliar a carteira no passado. */
export async function carregarFechamentos(codigos: string[], desde: string): Promise<Record<string, { data: string; preco: number }[]>> {
  if (codigos.length === 0) return {};
  const [candles, tesouro] = await Promise.all([
    supabase.from('cotacao_diaria').select('codigo, data, fechamento').in('codigo', codigos).gte('data', desde).order('data').limit(5000),
    supabase.from('preco_ativo').select('codigo, data, preco').in('codigo', codigos).gte('data', desde).order('data').limit(5000),
  ]);
  if (candles.error) throw new Error(candles.error.message);
  const saida: Record<string, { data: string; preco: number }[]> = {};
  for (const l of (candles.data ?? []) as { codigo: string; data: string; fechamento: number }[]) {
    (saida[l.codigo] ??= []).push({ data: l.data, preco: Math.round(Number(l.fechamento) * 100) });
  }
  for (const l of (tesouro.data ?? []) as { codigo: string; data: string; preco: number }[]) {
    if (saida[l.codigo]?.some((p) => p.data === l.data)) continue;
    (saida[l.codigo] ??= []).push({ data: l.data, preco: Math.round(Number(l.preco) * 100) });
  }
  Object.values(saida).forEach((s) => s.sort((a, b) => a.data.localeCompare(b.data)));
  return saida;
}

/* ------------------------------------------------------------------ */
/* Catálogo: B3 inteira + índices, EUA, moedas, cripto e commodities    */
/* ------------------------------------------------------------------ */

export interface AtivoCatalogo {
  codigo: string;
  nome: string;
  tipo: TipoMercado;
  mercado: 'B3' | 'EUA' | 'Global';
  moeda: string;
  setor: string | null;
  logo_url: string | null;
  preco: number | null;
  variacao: number | null;
  volume: number | null;
  valor_mercado: number | null;
  atualizado_em: string;
}

const COLUNAS_CATALOGO = 'codigo, nome, tipo, mercado, moeda, setor, logo_url, preco, variacao, volume, valor_mercado, atualizado_em';

const numeroOuNulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const paraCatalogo = (l: Record<string, unknown>): AtivoCatalogo => ({
  ...(l as unknown as AtivoCatalogo),
  preco: numeroOuNulo(l.preco),
  variacao: numeroOuNulo(l.variacao),
  volume: numeroOuNulo(l.volume),
  valor_mercado: numeroOuNulo(l.valor_mercado),
});

export const unidadeDe = (a: { moeda: string; tipo: TipoMercado }): AtivoMercado['unidade'] =>
  a.moeda === 'PTS' || a.tipo === 'indice' ? 'pts' : a.moeda === 'USD' ? 'US$' : 'R$';

export const paraAtivoMercado = (a: AtivoCatalogo): AtivoMercado => ({
  codigo: a.codigo, nome: nomeLegivel(a.nome), tipo: a.tipo, unidade: unidadeDe(a), logo: a.logo_url, setor: a.setor,
});

const SIGLAS = new Set(['SA', 'S.A.', 'S/A', 'FII', 'ETF', 'BDR', 'II', 'III', 'IV', 'BTG', 'XP', 'CSHG', 'HSI', 'VBI', 'TRX', 'RBR', 'BB', 'MSCI', 'USA', 'S&P', 'ESG', 'B3', 'BRF', 'JBS', 'CPFL', 'CSN', 'IRB', 'CVC', 'TIM', 'WEG']);
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em']);

/** Linha de apoio sob o código: o nome, ou tipo e setor quando o nome é só o código (caso dos BDRs). */
export function descricaoAtivo(a: { codigo: string; nome: string; tipo: TipoMercado; setor?: string | null }): string {
  if (a.nome.toUpperCase() !== a.codigo) return nomeLegivel(a.nome);
  return [NOME_TIPO[a.tipo], a.setor].filter(Boolean).join(' · ');
}

/** "PETROLEO BRASILEIRO S.A. PETROBRAS" vira "Petroleo Brasileiro S.A. Petrobras". Nomes já com minúsculas ficam como estão. */
export function nomeLegivel(nome: string): string {
  if (nome !== nome.toUpperCase()) return nome;
  return nome.split(' ').map((p, i) => {
    if (SIGLAS.has(p)) return p;
    const baixo = p.toLowerCase();
    if (i > 0 && MINUSCULAS.has(baixo)) return baixo;
    return baixo.replace(/(^|[(/.-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  }).join(' ');
}

/** Busca por código ou nome; o código exato vem primeiro, depois os mais negociados. */
export async function buscarAtivos(termo: string, limite = 12): Promise<AtivoCatalogo[]> {
  const t = termo.trim().replace(/[^\p{L}\p{N} .&-]/gu, '').slice(0, 40);
  if (!t) return [];
  const { data, error } = await supabase
    .from('mercado_ativo').select(COLUNAS_CATALOGO)
    .or(`codigo.ilike.${t}%,nome.ilike.%${t}%`)
    .order('volume', { ascending: false, nullsFirst: false })
    .limit(40);
  if (error) throw new Error(error.message);
  const alvo = t.toUpperCase();
  const peso = (a: AtivoCatalogo) => (a.codigo === alvo ? 0 : a.codigo.startsWith(alvo) ? 1 : 2);
  return (data ?? []).map(paraCatalogo).sort((a, b) => peso(a) - peso(b)).slice(0, limite);
}

export type FiltroMercado =
  | { tipo: 'altas' | 'baixas' | 'negociadas' }
  | { tipo: 'tipos'; tipos: TipoMercado[] };

/** Ativos de uma aba do explorador, com paginação. Altas e baixas só entre os que têm liquidez. */
export async function listarAtivos(filtro: FiltroMercado, pagina: number, porPagina = 25): Promise<{ itens: AtivoCatalogo[]; total: number }> {
  const porVariacao = filtro.tipo === 'altas' || filtro.tipo === 'baixas';
  // Altas e baixas: só empresas e fundos da B3 (BDRs sobem e descem com o dólar e a bolsa de fora).
  const tipos: TipoMercado[] = filtro.tipo === 'tipos' ? filtro.tipos : porVariacao ? ['acao', 'fii', 'etf'] : ['acao', 'fii', 'etf', 'bdr'];
  const { data, error, count } = await supabase
    .from('mercado_ativo').select(COLUNAS_CATALOGO, { count: 'exact' })
    .not('preco', 'is', null).in('tipo', tipos)
    .or(porVariacao ? 'volume.gte.200000' : 'volume.is.null,volume.gte.0')
    .order(porVariacao ? 'variacao' : 'volume', { ascending: filtro.tipo === 'baixas', nullsFirst: false })
    .order('codigo')
    .range(pagina * porPagina, pagina * porPagina + porPagina - 1);
  if (error) throw new Error(error.message);
  return { itens: (data ?? []).map(paraCatalogo), total: count ?? 0 };
}

export async function carregarDoCatalogo(codigos: string[]): Promise<AtivoCatalogo[]> {
  if (codigos.length === 0) return [];
  const { data, error } = await supabase.from('mercado_ativo').select(COLUNAS_CATALOGO).in('codigo', codigos);
  if (error) throw new Error(error.message);
  return (data ?? []).map(paraCatalogo);
}

/* ------------------------------------------------------------------ */
/* Minha lista (como o app Bolsa do iPhone)                            */
/* ------------------------------------------------------------------ */

/** Lista de quem ainda não escolheu nada: Brasil, EUA e cripto, mais os ETFs da pessoa. */
export const LISTA_PADRAO = ['IBOV', 'USDBRL', 'SP500', 'NASDAQ', 'PETR4', 'VALE3', 'ITUB4', 'BTC'];

export interface MinhaLista {
  codigos: string[];
  personalizada: boolean;
}

export async function carregarMinhaLista(etfsDaPessoa: string[] = []): Promise<MinhaLista> {
  const { data, error } = await supabase.from('lista_acompanhamento').select('codigo, ordem').order('ordem').order('criado_em');
  // Sem a tabela (backend ainda não atualizado) ou fora do ar: a lista padrão mantém a tela de pé.
  if (!error && data && data.length > 0) return { codigos: data.map((l) => l.codigo as string), personalizada: true };
  return { codigos: [...new Set([...LISTA_PADRAO, ...etfsDaPessoa])], personalizada: false };
}

/**
 * Põe ou tira um ativo da lista. Na primeira mudança, a lista padrão vira a
 * lista da pessoa (para não sumir tudo quando ela tira só um item).
 */
export async function alternarNaLista(codigo: string, atual: MinhaLista): Promise<MinhaLista> {
  const tem = atual.codigos.includes(codigo);
  const codigos = tem ? atual.codigos.filter((c) => c !== codigo) : [...atual.codigos, codigo];
  if (!atual.personalizada) {
    const { error } = await supabase.from('lista_acompanhamento').insert(codigos.map((c, ordem) => ({ codigo: c, ordem })));
    if (error) throw new Error(error.message);
  } else if (tem) {
    const { error } = await supabase.from('lista_acompanhamento').delete().eq('codigo', codigo);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('lista_acompanhamento').insert({ codigo, ordem: codigos.length - 1 });
    if (error) throw new Error(error.message);
  }
  return { codigos, personalizada: true };
}

/**
 * Resumo para listas: nome, logo e tipo do catálogo; preço e minigráfico dos
 * candles quando existem (mesma fonte do gráfico), senão o preço do catálogo.
 */
export async function carregarResumoCatalogo(codigos: string[]): Promise<ResumoAtivo[]> {
  const [catalogo, candles] = await Promise.all([
    carregarDoCatalogo(codigos),
    supabase.from('cotacao_diaria').select('codigo, data, fechamento').in('codigo', codigos)
      .gte('data', somarDias(hojeSP(), -50)).order('data').limit(3000),
  ]);
  const linhas = (candles.data ?? []) as { codigo: string; data: string; fechamento: number }[];
  return codigos.flatMap<ResumoAtivo>((codigo) => {
    const c = catalogo.find((a) => a.codigo === codigo);
    const s = linhas.filter((l) => l.codigo === codigo);
    const base = c ? paraAtivoMercado(c) : PAINEL_MERCADO.find((a) => a.codigo === codigo);
    if (!base) return [];
    const ultimoCandle = s[s.length - 1];
    const usarCandles = s.length > 1 && (!c?.preco || ultimoCandle.data >= hojeSP(new Date(c.atualizado_em)));
    if (usarCandles) {
      const ultimo = Number(ultimoCandle.fechamento);
      const anterior = Number(s[s.length - 2].fechamento);
      return [{ ...base, ultimo, anterior, data: ultimoCandle.data, variacao: ((ultimo - anterior) / anterior) * 100, serie: s.slice(-30).map((l) => Number(l.fechamento)) }];
    }
    if (!c?.preco) return [];
    return [{ ...base, ultimo: c.preco, anterior: null, data: hojeSP(new Date(c.atualizado_em)), variacao: c.variacao ?? 0, serie: s.map((l) => Number(l.fechamento)) }];
  });
}

export interface NoticiaRow {
  id: number;
  url: string;
  titulo: string;
  resumo: string | null;
  imagem_url: string | null;
  fonte: string;
  publicado_em: string;
}

export async function carregarNoticias(limite = 30): Promise<NoticiaRow[]> {
  const { data, error } = await supabase
    .from('noticia')
    .select('id, url, titulo, resumo, imagem_url, fonte, publicado_em')
    .order('publicado_em', { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  return data as NoticiaRow[];
}

/** Série histórica de um indicador (CDI diário, IPCA mensal...) para minigráficos. */
export async function carregarSerieIndicador(codigo: string, pontos = 60): Promise<number[]> {
  const { data, error } = await supabase
    .from('indicador_historico').select('valor')
    .eq('codigo', codigo).order('data_referencia', { ascending: false }).limit(pontos);
  if (error) throw new Error(error.message);
  return (data as { valor: number }[]).map((l) => Number(l.valor)).reverse();
}

/* ------------------------------------------------------------------ */

export type EstadoPregao = 'aberto' | 'fechado' | 'pre';

/** Pregão regular da B3: 10h às 17h (Brasília), em dias úteis. */
export function estadoPregao(agora = new Date()): EstadoPregao {
  const hoje = hojeSP(agora);
  if (!ehDiaUtil(hoje)) return 'fechado';
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(agora).split(':').map(Number);
  const minutos = h * 60 + m;
  if (minutos >= 600 && minutos < 1020) return 'aberto';
  if (minutos >= 540 && minutos < 600) return 'pre';
  return 'fechado';
}

export function tempoRelativo(iso: string, agora = new Date()): string {
  const s = Math.max(0, (agora.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

/** Casas decimais: câmbio com 4, índices grandes sem centavos, centavos para o resto. */
export function casasDe(valor: number, unidade: AtivoMercado['unidade'], tipo?: TipoMercado): number {
  if (tipo === 'moeda') return 4;
  if (unidade === 'pts') return valor >= 1000 ? 0 : 2;
  return valor > 0 && valor < 1 ? 4 : 2;
}

export function formatarPreco(valor: number, unidade: AtivoMercado['unidade'], tipo?: TipoMercado): string {
  const casas = casasDe(valor, unidade, tipo);
  const n = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(valor);
  return unidade === 'pts' ? `${n} pts` : `${unidade} ${n}`;
}
