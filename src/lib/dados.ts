import { useCallback, useEffect, useState } from 'react';
import { somarDias, type DataISO } from '../domain/calendario';
import { avaliarPosicao, resumirPorClasse, type Ativo, type Movimentacao, type Posicao, type PrecoMercado, type SaldoExtrato } from '../domain/carteira';
import { metaReserva } from '../domain/metas';
import type { EntradaRateio, ResultadoRateio } from '../domain/rateio';
import { escolherRendaFixa, type DadosMercado, type EscolhaRF, type TituloIPCA } from '../domain/rendaFixa';
import { centavos, CLASSES_INVESTIMENTO, type Classe, type ClasseInvestimento, type Indexador, type TipoAtivo, type TipoPerfil } from '../domain/tipos';
import { hojeSP } from './formato';
import { supabase } from './supabase';

/* ------------------------------------------------------------------ */
/* Linhas do banco                                                     */
/* ------------------------------------------------------------------ */

export interface PerfilRow {
  usuario_id: string;
  nome: string;
  tipo_perfil: TipoPerfil;
  gasto_mensal: number;
  meses_reserva: number;
  dia_aporte: number;
  prazo_anos: number;
  pct_renda_fixa: number;
  pct_acoes_br: number;
  pct_exterior: number;
  etf_acoes_br: string;
  etf_exterior: string;
  produto_reserva: string;
  cdb_pre_nome: string | null;
  cdb_pre_taxa: number | null;
  caixa_pendente: number;
  onboarding_concluido: boolean;
  aceite_termos_em: string | null;
  revisado_em: string | null;
}

export interface IndicadorRow {
  codigo: string;
  nome: string;
  valor: number;
  unidade: string;
  data_referencia: string;
  fonte: string;
  fonte_url: string | null;
  status: 'ok' | 'desatualizado' | 'falhou';
  atualizado_em: string;
}

interface AtivoRow {
  id: string;
  usuario_id: string | null;
  codigo: string;
  nome: string;
  classe: Classe;
  tipo: TipoAtivo;
  indexador: Indexador;
  vencimento: string | null;
  isento_ir: boolean;
  liquidez_diaria: boolean;
}

interface MovRow {
  id: string;
  ativo_id: string;
  tipo: 'compra' | 'venda';
  data: string;
  quantidade: number;
  preco_unitario: number;
  taxa_contratada: number | null;
  aporte_id: string | null;
}

export interface MetaRow {
  id: string;
  tipo: 'patrimonio' | 'personalizada';
  nome: string;
  valor_alvo: number;
  prazo: string | null;
}

export const pesosDoPerfil = (p: PerfilRow): Record<ClasseInvestimento, number> => ({
  renda_fixa: Number(p.pct_renda_fixa),
  acoes_br: Number(p.pct_acoes_br),
  exterior: Number(p.pct_exterior),
});

/* ------------------------------------------------------------------ */
/* Cache local: o app abre mesmo sem internet, com o último dado salvo */
/* ------------------------------------------------------------------ */

function lerCache<T>(chave: string): { salvoEm: string; valor: T } | null {
  try {
    const bruto = localStorage.getItem(`investindo:${chave}`);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

function gravarCache<T>(chave: string, valor: T) {
  try {
    localStorage.setItem(`investindo:${chave}`, JSON.stringify({ salvoEm: new Date().toISOString(), valor }));
  } catch {
    /* armazenamento cheio ou bloqueado: segue sem cache */
  }
}

export function limparCache() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('investindo:')).forEach((k) => localStorage.removeItem(k));
  } catch {
    /* nada a fazer */
  }
}

export interface Resultado<T> {
  dados: T | null;
  erro: string | null;
  carregando: boolean;
  /** Preenchido quando os dados vieram do cache por falta de conexão. */
  doCacheDe: string | null;
  recarregar: () => void;
}

/** Carrega com cache: se a rede falhar, devolve a última versão salva e avisa. */
export function useCarregar<T>(chaveCache: string | null, carregar: () => Promise<T>, deps: unknown[] = []): Resultado<T> {
  const [estado, setEstado] = useState<Omit<Resultado<T>, 'recarregar'>>({ dados: null, erro: null, carregando: true, doCacheDe: null });
  const [versao, setVersao] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fn = useCallback(carregar, deps);

  useEffect(() => {
    let vivo = true;
    setEstado((e) => ({ ...e, carregando: true }));
    fn()
      .then((dados) => {
        if (!vivo) return;
        if (chaveCache) gravarCache(chaveCache, dados);
        setEstado({ dados, erro: null, carregando: false, doCacheDe: null });
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        const cache = chaveCache ? lerCache<T>(chaveCache) : null;
        const erro = e instanceof Error ? e.message : 'Não foi possível carregar.';
        setEstado({ dados: cache?.valor ?? null, erro, carregando: false, doCacheDe: cache?.salvoEm ?? null });
      });
    return () => {
      vivo = false;
    };
  }, [fn, chaveCache, versao]);

  return { ...estado, recarregar: () => setVersao((v) => v + 1) };
}

const exigir = <T>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

/* ------------------------------------------------------------------ */
/* Perfil e indicadores                                                */
/* ------------------------------------------------------------------ */

export async function carregarPerfil(): Promise<PerfilRow> {
  return exigir(await supabase.from('perfil').select('*').single());
}

export async function salvarPerfil(parcial: Partial<Omit<PerfilRow, 'usuario_id'>>): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Sessão expirada.');
  exigir(await supabase.from('perfil').update(parcial).eq('usuario_id', data.user.id).select('usuario_id'));
}

export async function carregarIndicadores(): Promise<Record<string, IndicadorRow>> {
  const linhas = exigir<IndicadorRow[]>(await supabase.from('indicador').select('*'));
  return Object.fromEntries(linhas.map((l) => [l.codigo, { ...l, valor: Number(l.valor) }]));
}

/**
 * Dado mais velho que isso (em dias corridos) aparece como desatualizado. O IPCA
 * tem data no 1º dia do mês de referência e sai por volta do dia 10 do mês
 * seguinte, então o mais recente pode ter até ~70 dias.
 */
const VALIDADE_DIAS: Record<string, number> = { ipca_mes: 75, ipca_12m: 75, focus_ipca_12m: 10 };

export function estaDesatualizado(i: IndicadorRow, hoje = hojeSP()): boolean {
  if (i.status !== 'ok') return true;
  return i.data_referencia < somarDias(hoje, -(VALIDADE_DIAS[i.codigo] ?? 5));
}

/* ------------------------------------------------------------------ */
/* Carteira                                                            */
/* ------------------------------------------------------------------ */

export interface DadosCarteira {
  hoje: DataISO;
  perfil: PerfilRow;
  ativos: Ativo[];
  movimentacoes: (Movimentacao & { aporteId: string | null })[];
  extratos: SaldoExtrato[];
  precos: Record<string, PrecoMercado & { taxaCompra: number | null; precoCompra: number | null }>;
  mercado: DadosMercado;
  indicadores: Record<string, IndicadorRow>;
  metas: MetaRow[];
}

const paraAtivo = (a: AtivoRow): Ativo => ({
  id: a.id, codigo: a.codigo, nome: a.nome, classe: a.classe, tipo: a.tipo,
  indexador: a.indexador, vencimento: a.vencimento, isentoIR: a.isento_ir,
});

export async function carregarCarteira(): Promise<DadosCarteira> {
  const hoje = hojeSP();
  const [perfil, indicadores, ativosRows, movRows, extratoRows, metas] = await Promise.all([
    carregarPerfil(),
    carregarIndicadores(),
    supabase.from('ativo').select('*').order('nome').then(exigir<AtivoRow[]>),
    supabase.from('movimentacao').select('id, ativo_id, tipo, data, quantidade, preco_unitario, taxa_contratada, aporte_id').order('data').then(exigir<MovRow[]>),
    supabase.from('saldo_extrato').select('ativo_id, data, valor_bruto').then(exigir<{ ativo_id: string; data: string; valor_bruto: number }[]>),
    supabase.from('meta').select('id, tipo, nome, valor_alvo, prazo').order('criado_em').then(exigir<MetaRow[]>),
  ]);

  const ativos = ativosRows.map(paraAtivo);
  const porId = new Map(ativos.map((a) => [a.id, a]));
  const movimentacoes = movRows.map((m) => ({
    id: m.id, ativoId: m.ativo_id, tipo: m.tipo, data: m.data,
    quantidade: Number(m.quantidade), precoUnitario: centavos(Number(m.preco_unitario)),
    taxaContratada: m.taxa_contratada === null ? null : Number(m.taxa_contratada), aporteId: m.aporte_id,
  }));
  const extratos = extratoRows.map((x) => ({ ativoId: x.ativo_id, data: x.data, valorBruto: centavos(Number(x.valor_bruto)) }));

  // Preços: ativos que a pessoa tem, os ETFs escolhidos e os títulos que o rateio
  // pode sugerir (IPCA+ para a renda fixa, Selic para a reserva).
  const codigos = new Set<string>([perfil.etf_acoes_br, perfil.etf_exterior]);
  movimentacoes.forEach((m) => { const a = porId.get(m.ativoId); if (a) codigos.add(a.codigo); });
  ativos
    .filter((a) => a.tipo === 'tesouro' && (a.indexador === 'selic' || /^Tesouro IPCA\+ \d{4}$/.test(a.nome)))
    .forEach((a) => codigos.add(a.codigo));
  // Janela curta: o PostgREST devolve no máximo 1.000 linhas por consulta.
  const precoRows = exigir<{ codigo: string; data: string; preco: number; preco_compra: number | null; taxa_compra: number | null; fonte: string }[]>(
    await supabase.from('preco_ativo').select('codigo, data, preco, preco_compra, taxa_compra, fonte')
      .in('codigo', [...codigos]).gte('data', somarDias(hoje, -10)).order('data', { ascending: false }).limit(1000),
  );
  const precos: DadosCarteira['precos'] = {};
  for (const p of precoRows) {
    if (precos[p.codigo]) continue; // já temos o mais recente
    precos[p.codigo] = {
      preco: centavos(Number(p.preco)), data: p.data, fonte: p.fonte,
      taxaCompra: p.taxa_compra === null ? null : Number(p.taxa_compra),
      precoCompra: p.preco_compra === null ? null : centavos(Number(p.preco_compra)),
    };
  }

  // Séries para a curva da renda fixa, desde a primeira aplicação.
  const desde = movimentacoes[0]?.data ?? hoje;
  const historico = exigir<{ codigo: string; data_referencia: string; valor: number }[]>(
    await supabase.from('indicador_historico').select('codigo, data_referencia, valor')
      .in('codigo', ['cdi_diario', 'selic_diaria', 'ipca_mes']).gte('data_referencia', somarDias(desde, -40))
      .order('data_referencia').limit(5000),
  );
  const serie = (codigo: string) => historico.filter((h) => h.codigo === codigo).map((h) => ({ data: h.data_referencia, valor: Number(h.valor) }));
  const mercado: DadosMercado = {
    cdiDiario: serie('cdi_diario'),
    selicDiaria: serie('selic_diaria'),
    ipcaMensal: serie('ipca_mes').map((p) => ({ mes: p.data, valor: p.valor })),
  };

  return { hoje, perfil, ativos, movimentacoes, extratos, precos, mercado, indicadores, metas: metas.map((m) => ({ ...m, valor_alvo: Number(m.valor_alvo) })) };
}

export function calcularPosicoes(d: DadosCarteira): Posicao[] {
  const comMovimento = new Set(d.movimentacoes.map((m) => m.ativoId));
  return d.ativos
    .filter((a) => comMovimento.has(a.id))
    .map((a) => avaliarPosicao(a, d.movimentacoes, d.extratos, d.precos[a.codigo], d.mercado, d.hoje))
    .filter((p) => p.quantidade > 0);
}

/**
 * Rendimento no mês = valor hoje − valor no fim do mês anterior − dinheiro novo no mês.
 * Usa os preços salvos daquela data; sem histórico suficiente, devolve null.
 */
export async function rendimentoDoMes(d: DadosCarteira, valorHoje: number): Promise<number | null> {
  const inicioMes = `${d.hoje.slice(0, 8)}01`;
  const fimAnterior = somarDias(inicioMes, -1);
  const antes = d.movimentacoes.filter((m) => m.data <= fimAnterior);
  if (antes.length === 0) return null;
  const porId = new Map(d.ativos.map((a) => [a.id, a]));
  const codigos = [...new Set(antes.map((m) => porId.get(m.ativoId)?.codigo).filter(Boolean) as string[])];
  const linhas = exigir<{ codigo: string; data: string; preco: number; fonte: string }[]>(
    await supabase.from('preco_ativo').select('codigo, data, preco, fonte').in('codigo', codigos)
      .lte('data', fimAnterior).gte('data', somarDias(fimAnterior, -10)).order('data', { ascending: false }),
  );
  const precos: Record<string, PrecoMercado> = {};
  for (const p of linhas) precos[p.codigo] ??= { preco: centavos(Number(p.preco)), data: p.data, fonte: p.fonte };
  const valorAntes = d.ativos
    .filter((a) => antes.some((m) => m.ativoId === a.id))
    .map((a) => avaliarPosicao(a, antes, d.extratos.filter((x) => x.data <= fimAnterior), precos[a.codigo], d.mercado, fimAnterior))
    .reduce((s, p) => s + p.valorBruto, 0);
  const dinheiroNovo = d.movimentacoes
    .filter((m) => m.data >= inicioMes)
    .reduce((s, m) => s + (m.tipo === 'compra' ? 1 : -1) * Math.round(m.quantidade * m.precoUnitario), 0);
  return valorHoje - valorAntes - dinheiroNovo;
}

export interface AportePendente {
  id: string;
  data: string;
  valor_informado: number;
  itens: { id: string; classe: Classe; ativo_id: string | null; produto: string; valor_sugerido: number; quantidade_sugerida: number | null; preco_referencia: number | null; motivo: string | null }[];
}

export async function carregarAportePendente(): Promise<AportePendente | null> {
  const linhas = exigir<(Omit<AportePendente, 'itens'> & { aporte_item: AportePendente['itens'] })[]>(
    await supabase.from('aporte')
      .select('id, data, valor_informado, aporte_item(id, classe, ativo_id, produto, valor_sugerido, quantidade_sugerida, preco_referencia, motivo)')
      .eq('status', 'sugerido').order('criado_em', { ascending: false }).limit(1),
  );
  const a = linhas[0];
  return a ? { id: a.id, data: a.data, valor_informado: Number(a.valor_informado), itens: a.aporte_item } : null;
}

export function resumoDaCarteira(d: DadosCarteira) {
  const posicoes = calcularPosicoes(d);
  const resumo = resumirPorClasse(posicoes, pesosDoPerfil(d.perfil));
  const meta = metaReserva(centavos(Number(d.perfil.gasto_mensal)), d.perfil.meses_reserva);
  return { posicoes, ...resumo, metaReserva: meta };
}

/* ------------------------------------------------------------------ */
/* Rateio                                                              */
/* ------------------------------------------------------------------ */

/** Tesouro IPCA+ sem juros semestrais, com taxa de compra do dia. */
export function titulosIPCA(d: DadosCarteira): TituloIPCA[] {
  return d.ativos
    .filter((a) => a.tipo === 'tesouro' && a.vencimento && /^Tesouro IPCA\+ \d{4}$/.test(a.nome))
    .flatMap((a) => {
      const p = d.precos[a.codigo];
      return p && p.taxaCompra !== null
        ? [{ nome: a.nome, vencimento: a.vencimento!, taxaReal: p.taxaCompra, puCompra: p.precoCompra }]
        : [];
    });
}

export interface ContextoRateio {
  entrada: Omit<EntradaRateio, 'aporte'>;
  escolhaRF: EscolhaRF | null;
  avisos: string[];
}

export function montarContextoRateio(d: DadosCarteira): ContextoRateio {
  const avisos: string[] = [];
  const { classes, metaReserva: meta, totalReserva } = resumoDaCarteira(d);
  const saldos = Object.fromEntries(CLASSES_INVESTIMENTO.map((c) => [c, classes.find((x) => x.classe === c)!.valorBruto])) as Record<ClasseInvestimento, number>;

  const focus = d.indicadores.focus_ipca_12m ?? d.indicadores.ipca_12m;
  if (!d.indicadores.focus_ipca_12m) avisos.push('Sem a expectativa do Focus; usamos o IPCA dos últimos 12 meses.');
  const escolhaRF = escolherRendaFixa({
    hoje: d.hoje,
    prazoAnos: d.perfil.prazo_anos,
    ipcaEsperado: focus ? Number(focus.valor) : 4.5,
    titulos: titulosIPCA(d),
    cdbPre: d.perfil.cdb_pre_taxa ? { nome: d.perfil.cdb_pre_nome || 'CDB prefixado', taxa: Number(d.perfil.cdb_pre_taxa) } : null,
  });
  if (!escolhaRF) avisos.push('Sem taxas do Tesouro agora; a renda fixa aparece como "Tesouro IPCA+".');

  const etf = (codigo: string) => {
    const p = d.precos[codigo];
    if (!p) avisos.push(`Sem cotação recente de ${codigo}.`);
    else if (p.data < somarDias(d.hoje, -5)) avisos.push(`A cotação de ${codigo} é de ${p.data.split('-').reverse().join('/')}.`);
    return { codigo, preco: p?.preco ?? null };
  };

  // Mínimo do Tesouro Selic: 1% do título mais barato, nunca menos de R$ 30.
  const pusSelic = d.ativos
    .filter((a) => a.tipo === 'tesouro' && a.indexador === 'selic')
    .map((a) => d.precos[a.codigo]?.precoCompra ?? d.precos[a.codigo]?.preco)
    .filter((p): p is number => typeof p === 'number' && p > 0);
  const minimoReserva = /tesouro selic/i.test(d.perfil.produto_reserva) && pusSelic.length
    ? Math.max(3000, Math.ceil(Math.min(...pusSelic) / 100))
    : undefined;

  return {
    entrada: {
      caixaPendente: centavos(Number(d.perfil.caixa_pendente)),
      reserva: { saldo: totalReserva, meta, produto: d.perfil.produto_reserva, minimo: minimoReserva },
      saldos,
      pesos: pesosDoPerfil(d.perfil),
      etfs: { acoes_br: etf(d.perfil.etf_acoes_br), exterior: etf(d.perfil.etf_exterior) },
      rendaFixa: { produto: escolhaRF?.produto ?? 'Tesouro IPCA+', minimo: escolhaRF?.minimo ?? 3000 },
    },
    escolhaRF,
    avisos,
  };
}

/** Ativo do catálogo (ou da pessoa) que corresponde a um produto sugerido. */
export function ativoDoProduto(d: DadosCarteira, classe: Classe, produto: string): Ativo | undefined {
  return (
    d.ativos.find((a) => a.codigo === produto) ??
    d.ativos.find((a) => a.nome === produto && (a.classe === classe || a.tipo === 'tesouro')) ??
    d.ativos.find((a) => a.nome.startsWith(produto) && a.classe === classe)
  );
}

export async function salvarAporteSugerido(
  d: DadosCarteira,
  aporte: number,
  r: ResultadoRateio,
  ctx: ContextoRateio,
): Promise<string> {
  const competencia = `${d.hoje.slice(0, 8)}01`;
  const regras = {
    versao: 1,
    pesos: ctx.entrada.pesos,
    saldos: ctx.entrada.saldos,
    reserva: ctx.entrada.reserva,
    etfs: ctx.entrada.etfs,
    rendaFixa: ctx.escolhaRF,
    indicadores: Object.fromEntries(Object.values(d.indicadores).map((i) => [i.codigo, { valor: i.valor, data: i.data_referencia, fonte: i.fonte }])),
    passos: r.passos,
  };
  const { id } = exigir<{ id: string }>(
    await supabase.from('aporte').insert({
      competencia,
      data: d.hoje,
      valor_informado: aporte / 100,
      caixa_anterior: ctx.entrada.caixaPendente / 100,
      caixa_pendente_novo: r.caixaPendenteNovo / 100,
      regras,
    }).select('id').single(),
  );
  if (r.itens.length) {
    exigir(await supabase.from('aporte_item').insert(r.itens.map((i) => ({
      aporte_id: id,
      classe: i.classe,
      ativo_id: ativoDoProduto(d, i.classe, i.produto)?.id ?? null,
      produto: i.produto,
      valor_sugerido: i.valor / 100,
      quantidade_sugerida: i.quantidade,
      preco_referencia: i.precoReferencia === null ? null : i.precoReferencia / 100,
      motivo: i.motivo,
    }))).select('id'));
  }
  return id;
}

export interface CompraConfirmada {
  ativo_id: string;
  data: string;
  quantidade: number;
  preco_unitario: number; // em reais
  taxa_contratada: number | null;
}

export async function confirmarAporte(aporteId: string, compras: CompraConfirmada[]): Promise<void> {
  exigir(await supabase.rpc('confirmar_aporte', { p_aporte_id: aporteId, p_compras: compras }));
}

export async function cancelarAporte(aporteId: string): Promise<void> {
  exigir(await supabase.from('aporte').update({ status: 'cancelado' }).eq('id', aporteId).eq('status', 'sugerido').select('id'));
}

/* ------------------------------------------------------------------ */
/* Registros manuais                                                   */
/* ------------------------------------------------------------------ */

export async function criarAtivoProprio(a: {
  codigo: string; nome: string; classe: Classe; tipo: TipoAtivo; indexador: Indexador;
  vencimento: string | null; isento_ir: boolean; liquidez_diaria: boolean; emissor: string | null;
}): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Sessão expirada.');
  return exigir<{ id: string }>(await supabase.from('ativo').insert({ ...a, usuario_id: data.user.id }).select('id').single()).id;
}

export async function registrarMovimentacao(m: {
  ativo_id: string; tipo: 'compra' | 'venda'; data: string; quantidade: number; preco_unitario: number; taxa_contratada: number | null; observacao?: string;
}): Promise<void> {
  if (m.data > somarDias(hojeSP(), 1)) throw new Error('A data não pode estar no futuro.');
  exigir(await supabase.from('movimentacao').insert(m).select('id'));
}

export async function apagarMovimentacao(id: string): Promise<void> {
  exigir(await supabase.from('movimentacao').delete().eq('id', id).select('id'));
}

export async function registrarExtrato(ativoId: string, data: string, valorBruto: number): Promise<void> {
  if (data > hojeSP()) throw new Error('A data não pode estar no futuro.');
  exigir(await supabase.from('saldo_extrato').upsert({ ativo_id: ativoId, data, valor_bruto: valorBruto }, { onConflict: 'ativo_id,usuario_id,data' }).select('id'));
}

export async function salvarMeta(m: { id?: string; nome: string; valor_alvo: number; prazo: string | null; tipo?: MetaRow['tipo'] }): Promise<void> {
  if (m.id) exigir(await supabase.from('meta').update({ nome: m.nome, valor_alvo: m.valor_alvo, prazo: m.prazo }).eq('id', m.id).select('id'));
  else exigir(await supabase.from('meta').insert({ nome: m.nome, valor_alvo: m.valor_alvo, prazo: m.prazo, tipo: m.tipo ?? 'personalizada' }).select('id'));
}

export async function apagarMeta(id: string): Promise<void> {
  exigir(await supabase.from('meta').delete().eq('id', id).select('id'));
}

/* ------------------------------------------------------------------ */
/* Exportação (base do relatório de IR da v3)                          */
/* ------------------------------------------------------------------ */

export function movimentacoesEmCSV(d: DadosCarteira): string {
  const porId = new Map(d.ativos.map((a) => [a.id, a]));
  const linhas = [['data', 'tipo', 'ativo', 'classe', 'quantidade', 'preco_unitario', 'valor_total', 'taxa_contratada'].join(';')];
  const num = (v: number, casas = 2) => v.toFixed(casas).replace('.', ',');
  for (const m of d.movimentacoes) {
    const a = porId.get(m.ativoId);
    linhas.push([
      m.data, m.tipo, a?.nome ?? m.ativoId, a?.classe ?? '', num(m.quantidade, 8),
      num(m.precoUnitario / 100), num((m.quantidade * m.precoUnitario) / 100), m.taxaContratada === null ? '' : num(m.taxaContratada, 4),
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'));
  }
  return '﻿' + linhas.join('\r\n');
}
