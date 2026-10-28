// Alertas do Investindo!: lembrete do dia do aporte, carteira fora do alvo e
// títulos perto do vencimento. Saem por notificação (Web Push) em cada
// aparelho em que a pessoa ligou os avisos e, se ela pediu, por e-mail.
//
//   GET  /functions/v1/alertas                  chave pública VAPID (para o app se inscrever)
//   POST /functions/v1/alertas                  rodada diária (pg_cron, com COLETOR_SEGREDO)
//   POST /functions/v1/alertas {"teste": true}  notificação de teste para quem está logado
//
// Cada alerta tem uma chave ("aporte:2026-11") gravada em alerta_enviado: a
// gravação acontece antes do envio e não aceita repetição, então rodar a
// função duas vezes no mesmo dia não manda nada em dobro.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';
import { alertasDoDia, posicoesAtuais, type Alerta, type AtivoAlerta, type MovAlerta } from '../_shared/alertas.ts';
import { enviarEmail, escapar, layoutEmail } from '../_shared/email.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const VAPID_PUBLICA = Deno.env.get('VAPID_PUBLICA') ?? '';
const VAPID_PRIVADA = Deno.env.get('VAPID_PRIVADA') ?? '';
if (VAPID_PUBLICA && VAPID_PRIVADA) {
  webpush.setVapidDetails(Deno.env.get('VAPID_CONTATO') ?? 'mailto:nao-responda@investindo.app', VAPID_PUBLICA, VAPID_PRIVADA);
}

interface Inscricao { endpoint: string; usuario_id: string; p256dh: string; auth: string }

/** Manda para todos os aparelhos; inscrições que o navegador já cancelou são apagadas. */
async function enviarPush(db: SupabaseClient, inscricoes: Inscricao[], alerta: Alerta): Promise<number> {
  if (!VAPID_PRIVADA) return 0;
  let enviados = 0;
  const carga = JSON.stringify({ titulo: alerta.titulo, corpo: alerta.corpo, url: alerta.url, tag: alerta.chave });
  for (const i of inscricoes) {
    try {
      await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, carga, { TTL: 60 * 60 * 24, urgency: 'normal' });
      enviados++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.from('inscricao_push').delete().eq('endpoint', i.endpoint);
      else console.error('push falhou', status, (e as Error).message);
    }
  }
  return enviados;
}

function emailDoAlerta(nome: string, a: Alerta): string {
  return layoutEmail({
    titulo: a.titulo,
    paragrafos: [nome ? `Olá, ${escapar(nome)}.` : 'Olá.', escapar(a.corpo)],
    botao: { texto: 'Abrir o Investindo!', url: a.url },
    rodape: 'Você recebe este aviso porque ligou os alertas por e-mail em Ajustes. Para parar, desligue lá.',
  });
}

/** Uma rodada para todo mundo que tem algum aviso ligado. */
async function rodadaDiaria(db: SupabaseClient, hoje: string) {
  const { data: perfis, error } = await db
    .from('perfil')
    .select('usuario_id, nome, dia_aporte, pct_renda_fixa, pct_acoes_br, pct_exterior, alerta_push, alerta_email')
    .eq('onboarding_concluido', true)
    .or('alerta_push.eq.true,alerta_email.eq.true');
  if (error) throw error;
  if (!perfis?.length) return { pessoas: 0, alertas: 0, push: 0, emails: 0 };
  const ids = perfis.map((p) => p.usuario_id);

  const competencia = `${hoje.slice(0, 7)}-01`;
  const [movs, inscricoes, aportes, extratos] = await Promise.all([
    db.from('movimentacao').select('usuario_id, ativo_id, tipo, data, quantidade, valor_total').in('usuario_id', ids),
    db.from('inscricao_push').select('endpoint, usuario_id, p256dh, auth').in('usuario_id', ids),
    db.from('aporte').select('usuario_id').eq('status', 'confirmado').eq('competencia', competencia).in('usuario_id', ids),
    db.from('saldo_extrato').select('usuario_id, ativo_id, data, valor_bruto').in('usuario_id', ids).order('data', { ascending: false }),
  ]);
  for (const r of [movs, inscricoes, aportes, extratos]) if (r.error) throw r.error;

  const idsAtivos = [...new Set((movs.data ?? []).map((m) => m.ativo_id))];
  const ativos = idsAtivos.length
    ? (await db.from('ativo').select('id, codigo, nome, classe, tipo, vencimento').in('id', idsAtivos)).data ?? []
    : [];
  const codigos = [...new Set(ativos.map((a) => a.codigo))];
  const precos: Record<string, number> = {};
  if (codigos.length) {
    const { data } = await db.from('preco_ativo').select('codigo, preco, data').in('codigo', codigos)
      .gte('data', somarDias(hoje, -15)).order('data', { ascending: false });
    for (const p of data ?? []) precos[p.codigo] ??= Number(p.preco);
  }
  const confirmados = new Set((aportes.data ?? []).map((a) => a.usuario_id));

  let totalAlertas = 0;
  let totalPush = 0;
  let totalEmails = 0;
  for (const perfil of perfis) {
    const doUsuario: MovAlerta[] = (movs.data ?? [])
      .filter((m) => m.usuario_id === perfil.usuario_id)
      .map((m) => ({ ativoId: m.ativo_id, tipo: m.tipo, data: m.data, quantidade: Number(m.quantidade), valorTotal: Number(m.valor_total) }));
    const extratosDoUsuario: Record<string, { data: string; valor: number }> = {};
    for (const x of extratos.data ?? []) {
      if (x.usuario_id === perfil.usuario_id) extratosDoUsuario[x.ativo_id] ??= { data: x.data, valor: Number(x.valor_bruto) };
    }
    const posicoes = posicoesAtuais(ativos as AtivoAlerta[], doUsuario, precos, extratosDoUsuario);
    const candidatos = alertasDoDia({
      hoje,
      diaAporte: perfil.dia_aporte,
      aporteConfirmadoNoMes: confirmados.has(perfil.usuario_id),
      pesos: { renda_fixa: Number(perfil.pct_renda_fixa), acoes_br: Number(perfil.pct_acoes_br), exterior: Number(perfil.pct_exterior) },
      posicoes,
    });
    if (!candidatos.length) continue;

    const aparelhos = perfil.alerta_push ? (inscricoes.data ?? []).filter((i) => i.usuario_id === perfil.usuario_id) : [];
    const canais = [...(aparelhos.length ? ['push'] : []), ...(perfil.alerta_email ? ['email'] : [])];
    if (!canais.length) continue;

    // Grava primeiro: só volta o que ainda não tinha sido avisado.
    const { data: novos, error: erroGravar } = await db
      .from('alerta_enviado')
      .upsert(
        candidatos.map((a) => ({ usuario_id: perfil.usuario_id, chave: a.chave, titulo: a.titulo, corpo: a.corpo, canais })),
        { onConflict: 'usuario_id,chave', ignoreDuplicates: true },
      )
      .select('chave');
    if (erroGravar) throw erroGravar;
    const chavesNovas = new Set((novos ?? []).map((n) => n.chave));
    const aEnviar = candidatos.filter((a) => chavesNovas.has(a.chave));
    if (!aEnviar.length) continue;
    totalAlertas += aEnviar.length;

    let email: string | undefined;
    if (perfil.alerta_email) email = (await db.auth.admin.getUserById(perfil.usuario_id)).data.user?.email ?? undefined;
    for (const a of aEnviar) {
      totalPush += await enviarPush(db, aparelhos, a);
      if (email && (await enviarEmail(email, a.titulo, emailDoAlerta(perfil.nome, a)))) totalEmails++;
    }
  }
  return { pessoas: perfis.length, alertas: totalAlertas, push: totalPush, emails: totalEmails };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return resposta({ chavePublica: VAPID_PUBLICA || null });
  if (req.method !== 'POST') return resposta({ erro: 'use GET ou POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const enviado = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const segredo = Deno.env.get('COLETOR_SEGREDO') ?? '';

  // Rodada diária, chamada pelo pg_cron. "hoje" pode ser trocado para testar.
  if (segredo && enviado === segredo) {
    const hoje = new URL(req.url).searchParams.get('hoje') ?? hojeSP();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hoje)) return resposta({ erro: 'data inválida' }, 400);
    try {
      return resposta({ ok: true, hoje, ...(await rodadaDiaria(db, hoje)) });
    } catch (e) {
      console.error('rodada de alertas falhou', e);
      return resposta({ ok: false, erro: (e as Error).message }, 500);
    }
  }

  // Teste pedido pela própria pessoa em Ajustes.
  const { data: quem } = await db.auth.getUser(enviado);
  if (!quem?.user) return resposta({ erro: 'entre na sua conta' }, 401);
  const corpo = await req.json().catch(() => ({}));
  if (!corpo?.teste) return resposta({ erro: 'pedido inválido' }, 400);
  const { data: aparelhos } = await db.from('inscricao_push').select('endpoint, usuario_id, p256dh, auth').eq('usuario_id', quem.user.id);
  const enviados = await enviarPush(db, aparelhos ?? [], {
    chave: 'teste',
    titulo: 'Avisos ligados',
    corpo: 'É assim que o Investindo! vai lembrar você do dia do aporte.',
    url: '/configuracoes',
  });
  return resposta({ ok: true, aparelhos: aparelhos?.length ?? 0, enviados });
});
