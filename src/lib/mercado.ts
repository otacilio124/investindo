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

export interface AtivoMercado {
  codigo: string;
  nome: string;
  tipo: 'indice' | 'moeda' | 'etf';
  /** Prefixo do preço na tela: pontos para índices, R$ para o resto. */
  unidade: 'pts' | 'R$' | 'US$';
}

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

export async function carregarCandles(codigo: string, anos = 2): Promise<Candle[]> {
  const desde = somarDias(hojeSP(), -Math.round(anos * 366));
  const { data, error } = await supabase
    .from('cotacao_diaria')
    .select('codigo, data, abertura, maxima, minima, fechamento, volume')
    .eq('codigo', codigo).gte('data', desde).order('data').limit(1000);
  if (error) throw new Error(error.message);
  return (data as LinhaCandle[]).map(paraCandle);
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

export function formatarPreco(valor: number, unidade: AtivoMercado['unidade']): string {
  const casas = unidade === 'pts' ? 0 : unidade === 'R$' && valor < 20 ? 4 : 2;
  const n = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(valor);
  return unidade === 'pts' ? `${n} pts` : `${unidade} ${n}`;
}
