// Coletor diário do Investindo!: busca indicadores, preços do Tesouro e cotações
// de ETFs em fontes públicas e grava no banco. Chamado pelo pg_cron
// (supabase/agendamento.sql) com o segredo COLETOR_SEGREDO.
//
//   POST /functions/v1/coletor?tarefa=indicadores|tesouro|cotacoes|historico|noticias|tudo[&desde=AAAA-MM-DD]
//
// Redundância: cada dado tem uma cadeia de fontes (ver _shared/fontes.ts). Se
// todas falham, o último valor salvo é mantido e marcado como "desatualizado":
// o app nunca fica sem número, mas sempre mostra a data real do dado.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import {
  buscar,
  cadeiasIndicadores,
  cotacaoBrapi,
  cotacaoYahoo,
  fisher,
  identificarTitulo,
  lerTesouroCSV,
  precoConfere,
  primeiraQueResponde,
  SALTO_SUSPEITO,
  serieSGS,
  URL_TESOURO_CSV,
  type Cotacao,
  type Leitura,
} from '../_shared/fontes.ts';
import { FONTES_NOTICIAS, historicoYahoo, noticiasDaFonte, SIMBOLOS_MERCADO } from '../_shared/mercado.ts';

type Detalhe = { item: string; ok: boolean; fonte?: string; mensagem?: string };
type Tarefa = 'indicadores' | 'tesouro' | 'cotacoes' | 'historico' | 'noticias' | 'tudo';
const TAREFAS: Tarefa[] = ['indicadores', 'tesouro', 'cotacoes', 'historico', 'noticias', 'tudo'];

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

function iguaisEmTempoConstante(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let dif = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) dif |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return dif === 0;
}

/* --------------------------------------------------------------- */

async function gravarLeitura(db: SupabaseClient, l: Leitura) {
  const { error } = await db.from('indicador').upsert({
    codigo: l.codigo,
    nome: l.nome,
    valor: l.valor,
    unidade: l.unidade,
    data_referencia: l.dataReferencia,
    fonte: l.fonte,
    fonte_url: l.fonteUrl,
    status: 'ok',
    atualizado_em: new Date().toISOString(),
    verificado_em: new Date().toISOString(),
  });
  if (error) throw error;
  const historico = (l.historico ?? [{ data: l.dataReferencia, valor: l.valor }]).map((p) => ({
    codigo: l.codigo,
    data_referencia: p.data,
    valor: p.valor,
    fonte: l.fonte,
  }));
  for (let i = 0; i < historico.length; i += 500) {
    const { error: e2 } = await db.from('indicador_historico').upsert(historico.slice(i, i + 500));
    if (e2) throw e2;
  }
}

async function marcarDesatualizado(db: SupabaseClient, codigo: string) {
  await db.from('indicador').update({ status: 'desatualizado', verificado_em: new Date().toISOString() }).eq('codigo', codigo);
}

async function coletarIndicadores(db: SupabaseClient, hoje: string, desde: string | null): Promise<Detalhe[]> {
  const detalhes: Detalhe[] = [];
  const cadeias = cadeiasIndicadores(hoje);
  const lidos: Record<string, number> = {};

  for (const [codigo, tentativas] of Object.entries(cadeias)) {
    const r = await primeiraQueResponde(codigo, tentativas);
    if (r.leitura) {
      try {
        await gravarLeitura(db, r.leitura);
        lidos[codigo] = r.leitura.valor;
        detalhes.push({ item: codigo, ok: true, fonte: r.leitura.fonte, mensagem: r.erros.join(' | ') || undefined });
      } catch (e) {
        detalhes.push({ item: codigo, ok: false, mensagem: `gravação: ${(e as Error).message}` });
      }
    } else {
      await marcarDesatualizado(db, codigo);
      detalhes.push({ item: codigo, ok: false, mensagem: r.erros.join(' | ') });
    }
  }

  // Juro real, calculado com o que estiver salvo (inclusive valores de ontem se a fonte falhou hoje).
  const { data: atuais } = await db.from('indicador').select('codigo, valor, data_referencia').in('codigo', ['selic_meta', 'ipca_12m', 'focus_ipca_12m']);
  const v = Object.fromEntries((atuais ?? []).map((x) => [x.codigo, x]));
  const derivados: [string, string, string, string][] = [
    ['juro_real', 'Juro real (Selic e IPCA 12 meses)', 'selic_meta', 'ipca_12m'],
    ['juro_real_esperado', 'Juro real esperado (Selic e Focus)', 'selic_meta', 'focus_ipca_12m'],
  ];
  for (const [codigo, nome, a, b] of derivados) {
    if (!v[a] || !v[b]) continue;
    await gravarLeitura(db, {
      codigo, nome, unidade: '% a.a.',
      valor: fisher(Number(v[a].valor), Number(v[b].valor)),
      dataReferencia: v[a].data_referencia > v[b].data_referencia ? v[a].data_referencia : v[b].data_referencia,
      fonte: 'Calculado: (1 + Selic) ÷ (1 + inflação) − 1',
      fonteUrl: '',
    });
    detalhes.push({ item: codigo, ok: true, fonte: 'calculado' });
  }

  // Carga inicial do histórico diário (curva de CDB/Tesouro), só quando pedida.
  if (desde) {
    for (const [codigo, serie] of [['cdi_diario', 12], ['selic_diaria', 11], ['ipca_mes', 433]] as const) {
      try {
        const pontos = await serieSGS(serie, desde, hoje);
        const linhas = pontos.map((p) => ({ codigo, data_referencia: p.data, valor: p.valor, fonte: `Banco Central · SGS ${serie}` }));
        for (let i = 0; i < linhas.length; i += 500) await db.from('indicador_historico').upsert(linhas.slice(i, i + 500));
        detalhes.push({ item: `historico_${codigo}`, ok: true, mensagem: `${linhas.length} pontos` });
      } catch (e) {
        detalhes.push({ item: `historico_${codigo}`, ok: false, mensagem: (e as Error).message });
      }
    }
  }
  return detalhes;
}

/* --------------------------------------------------------------- */

async function coletarTesouro(db: SupabaseClient, hoje: string): Promise<Detalhe[]> {
  try {
    const csv = await (await buscar(URL_TESOURO_CSV, { tempoLimiteMs: 60_000, tentativas: 2 })).text();
    const titulos = lerTesouroCSV(csv).filter((t) => t.vencimento > hoje);

    const catalogo = titulos.map((t) => {
      const id = identificarTitulo(t);
      return {
        codigo: id.codigo, nome: id.nome, classe: id.classe, tipo: 'tesouro', indexador: id.indexador,
        vencimento: t.vencimento, liquidez_diaria: id.indexador === 'selic', emissor: 'Tesouro Nacional', disponivel: true,
      };
    });
    // Catálogo: insere títulos novos sem duplicar (índice único parcial em codigo).
    const { data: existentes } = await db.from('ativo').select('codigo').is('usuario_id', null).eq('tipo', 'tesouro');
    const conhecidos = new Set((existentes ?? []).map((x) => x.codigo));
    const novos = catalogo.filter((c) => !conhecidos.has(c.codigo));
    if (novos.length) {
      const { error } = await db.from('ativo').insert(novos);
      if (error) throw error;
    }

    const precos = titulos.map((t) => ({
      codigo: identificarTitulo(t).codigo,
      data: t.dataBase,
      preco: t.puVenda,
      preco_compra: t.puCompra,
      taxa_compra: t.taxaCompra,
      taxa_venda: t.taxaVenda,
      fonte: 'Tesouro Transparente',
    }));
    const { error } = await db.from('preco_ativo').upsert(precos);
    if (error) throw error;
    return [{ item: 'tesouro', ok: true, fonte: 'Tesouro Transparente', mensagem: `${precos.length} títulos de ${titulos[0]?.dataBase}` }];
  } catch (e) {
    return [{ item: 'tesouro', ok: false, mensagem: `${(e as Error).message}. Mantidos os últimos preços salvos.` }];
  }
}

/* --------------------------------------------------------------- */

async function coletarCotacoes(db: SupabaseClient): Promise<Detalhe[]> {
  const token = Deno.env.get('BRAPI_TOKEN') ?? '';
  const { data: catalogo } = await db.from('ativo').select('codigo').eq('tipo', 'etf').is('usuario_id', null);
  const { data: escolhidos } = await db.from('perfil').select('etf_acoes_br, etf_exterior');
  const codigos = new Set<string>((catalogo ?? []).map((x) => x.codigo));
  for (const p of escolhidos ?? []) {
    codigos.add(p.etf_acoes_br);
    codigos.add(p.etf_exterior);
  }

  const detalhes: Detalhe[] = [];
  for (const codigo of codigos) {
    const { data: anterior } = await db.from('preco_ativo').select('preco').eq('codigo', codigo).order('data', { ascending: false }).limit(1).maybeSingle();
    const fontes: (() => Promise<Cotacao>)[] = [() => cotacaoBrapi(codigo, token), () => cotacaoYahoo(codigo)];
    const erros: string[] = [];
    let aceita: Cotacao | null = null;

    for (let i = 0; i < fontes.length && !aceita; i++) {
      try {
        const c = await fontes[i]();
        const salto = anterior ? Math.abs(c.preco - Number(anterior.preco)) / Number(anterior.preco) : 0;
        if (salto > SALTO_SUSPEITO) {
          // Salto grande: só aceita se a outra fonte confirmar o mesmo preço.
          const outra = fontes[1 - i] ?? null;
          const confirmacao = outra ? await outra().catch(() => null) : null;
          if (confirmacao && precoConfere(c.preco, confirmacao.preco)) aceita = c;
          else erros.push(`${c.fonte}: variação de ${(salto * 100).toFixed(1)}% sem confirmação`);
        } else {
          aceita = c;
        }
      } catch (e) {
        erros.push((e as Error).message);
      }
    }

    if (aceita) {
      const { error } = await db.from('preco_ativo').upsert({ codigo, data: aceita.data, preco: aceita.preco, fonte: aceita.fonte, atualizado_em: new Date().toISOString() });
      detalhes.push({ item: codigo, ok: !error, fonte: aceita.fonte, mensagem: error?.message ?? (erros.join(' | ') || undefined) });
    } else {
      detalhes.push({ item: codigo, ok: false, mensagem: `${erros.join(' | ')}. Mantido o último preço salvo.` });
    }
  }
  return detalhes;
}

/* --------------------------------------------------------------- */

async function codigosAcompanhados(db: SupabaseClient): Promise<string[]> {
  const { data: catalogo } = await db.from('ativo').select('codigo').eq('tipo', 'etf').is('usuario_id', null);
  const { data: escolhidos } = await db.from('perfil').select('etf_acoes_br, etf_exterior');
  const codigos = new Set<string>(SIMBOLOS_MERCADO.map((s) => s.codigo));
  (catalogo ?? []).forEach((x) => codigos.add(x.codigo));
  (escolhidos ?? []).forEach((p) => { codigos.add(p.etf_acoes_br); codigos.add(p.etf_exterior); });
  return [...codigos];
}

/**
 * Candles diários. Na primeira vez de cada código busca 2 anos; depois, só os
 * últimos 5 dias (o pregão de hoje é reescrito até o fechamento).
 */
async function coletarHistorico(db: SupabaseClient): Promise<Detalhe[]> {
  const detalhes: Detalhe[] = [];
  for (const codigo of await codigosAcompanhados(db)) {
    try {
      const { count } = await db.from('cotacao_diaria').select('data', { count: 'exact', head: true }).eq('codigo', codigo);
      const candles = await historicoYahoo(codigo, (count ?? 0) < 200 ? '2y' : '5d');
      const linhas = candles.map((c) => ({
        codigo, data: c.data, abertura: c.abertura, maxima: c.maxima, minima: c.minima,
        fechamento: c.fechamento, volume: c.volume, fonte: 'Yahoo Finance', atualizado_em: new Date().toISOString(),
      }));
      for (let i = 0; i < linhas.length; i += 500) {
        const { error } = await db.from('cotacao_diaria').upsert(linhas.slice(i, i + 500));
        if (error) throw error;
      }
      detalhes.push({ item: `historico_${codigo}`, ok: true, fonte: 'Yahoo Finance', mensagem: `${linhas.length} candles` });
    } catch (e) {
      detalhes.push({ item: `historico_${codigo}`, ok: false, mensagem: `${(e as Error).message}. Mantido o histórico salvo.` });
    }
  }
  return detalhes;
}

/** Notícias de três fontes; uma fora do ar não impede as outras. Guarda 30 dias. */
async function coletarNoticias(db: SupabaseClient): Promise<Detalhe[]> {
  const detalhes: Detalhe[] = [];
  for (const fonte of FONTES_NOTICIAS) {
    try {
      const noticias = await noticiasDaFonte(fonte);
      const { error } = await db.from('noticia').upsert(
        noticias.slice(0, 40).map((n) => ({
          url: n.url, titulo: n.titulo, resumo: n.resumo, imagem_url: n.imagemUrl, fonte: n.fonte, publicado_em: n.publicadoEm,
        })),
        { onConflict: 'url' },
      );
      if (error) throw error;
      detalhes.push({ item: `noticias_${fonte.nome}`, ok: true, fonte: fonte.nome, mensagem: `${noticias.length} itens` });
    } catch (e) {
      detalhes.push({ item: `noticias_${fonte.nome}`, ok: false, mensagem: (e as Error).message });
    }
  }
  const limite = new Date(Date.now() - 30 * 86_400_000).toISOString();
  await db.from('noticia').delete().lt('publicado_em', limite);
  return detalhes;
}

/* --------------------------------------------------------------- */

Deno.serve(async (req) => {
  const segredo = Deno.env.get('COLETOR_SEGREDO') ?? '';
  const enviado = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!segredo || !iguaisEmTempoConstante(enviado, segredo)) {
    return new Response(JSON.stringify({ erro: 'não autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const url = new URL(req.url);
  const tarefa = (url.searchParams.get('tarefa') ?? 'tudo') as Tarefa;
  const desdeParam = url.searchParams.get('desde');
  const desde = desdeParam && /^\d{4}-\d{2}-\d{2}$/.test(desdeParam) ? desdeParam : null;
  if (!TAREFAS.includes(tarefa)) {
    return new Response(JSON.stringify({ erro: 'tarefa inválida' }), { status: 400 });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: execucao } = await db.from('coleta_execucao').insert({ tarefa }).select('id').single();
  const hoje = hojeSP();

  const detalhes: Detalhe[] = [];
  try {
    if (tarefa === 'indicadores' || tarefa === 'tudo') detalhes.push(...(await coletarIndicadores(db, hoje, desde)));
    if (tarefa === 'tesouro' || tarefa === 'tudo') detalhes.push(...(await coletarTesouro(db, hoje)));
    if (tarefa === 'cotacoes' || tarefa === 'tudo') detalhes.push(...(await coletarCotacoes(db)));
    if (tarefa === 'historico' || tarefa === 'tudo') detalhes.push(...(await coletarHistorico(db)));
    if (tarefa === 'noticias' || tarefa === 'tudo') detalhes.push(...(await coletarNoticias(db)));
  } catch (e) {
    detalhes.push({ item: 'geral', ok: false, mensagem: (e as Error).message });
  }

  const falhas = detalhes.filter((d) => !d.ok).length;
  const status = falhas === 0 ? 'ok' : falhas === detalhes.length ? 'falhou' : 'parcial';
  if (execucao) {
    await db.from('coleta_execucao').update({ status, detalhes, finalizado_em: new Date().toISOString() }).eq('id', execucao.id);
  }
  console.log(JSON.stringify({ tarefa, status, falhas }));
  return new Response(JSON.stringify({ tarefa, status, detalhes }), {
    status: status === 'falhou' ? 502 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
