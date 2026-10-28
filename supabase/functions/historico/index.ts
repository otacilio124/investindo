// Histórico de candles sob demanda: quando alguém abre o gráfico de um ativo
// do catálogo que o coletor ainda não acompanha (ou que está atrasado), busca
// no Yahoo, grava em cotacao_diaria e devolve. O banco serve de cache: a
// próxima pessoa que abrir o mesmo ativo já lê direto da tabela.
//
//   POST /functions/v1/historico   { "codigo": "PETR4" }   (exige sessão)

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { historicoYahoo, SIMBOLOS_GLOBAIS, SIMBOLOS_MERCADO } from '../_shared/mercado.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'use POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  // A sessão da pessoa só prova que ela tem conta; quem grava é a chave de serviço.
  const comoPessoa = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: usuario } = await comoPessoa.auth.getUser();
  if (!usuario?.user) return resposta({ erro: 'entre na sua conta' }, 401);

  const codigo = String((await req.json().catch(() => ({})))?.codigo ?? '').toUpperCase();
  if (!/^[A-Z0-9^=.\-]{1,16}$/.test(codigo)) return resposta({ erro: 'código inválido' }, 400);

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // Só ativos conhecidos: ninguém usa a função para buscar símbolos quaisquer no Yahoo.
  const conhecido = SIMBOLOS_GLOBAIS.some((s) => s.codigo === codigo) || SIMBOLOS_MERCADO.some((s) => s.codigo === codigo)
    || Boolean((await db.from('mercado_ativo').select('codigo').eq('codigo', codigo).maybeSingle()).data);
  if (!conhecido) return resposta({ erro: 'ativo fora do catálogo' }, 404);

  const { data: ultimo } = await db.from('cotacao_diaria').select('data').eq('codigo', codigo).order('data', { ascending: false }).limit(1).maybeSingle();
  const { count } = await db.from('cotacao_diaria').select('data', { count: 'exact', head: true }).eq('codigo', codigo);
  const atrasado = !ultimo || diasEntre(ultimo.data, hojeSP()) > 3;

  let fonte = 'banco';
  if (atrasado || (count ?? 0) < 200) {
    try {
      const candles = await historicoYahoo(codigo, (count ?? 0) < 200 ? '2y' : '1mo');
      const linhas = candles.map((c) => ({ codigo, ...c, fonte: 'Yahoo Finance', atualizado_em: new Date().toISOString() }));
      for (let i = 0; i < linhas.length; i += 500) {
        const { error } = await db.from('cotacao_diaria').upsert(linhas.slice(i, i + 500));
        if (error) throw error;
      }
      fonte = 'Yahoo Finance';
    } catch (e) {
      // Sem a fonte, devolve o que já houver salvo (talvez nada); o app avisa.
      console.log(JSON.stringify({ codigo, erro: (e as Error).message }));
      fonte = 'banco (Yahoo indisponível)';
    }
  }

  const desde = new Date(Date.now() - 2 * 366 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db.from('cotacao_diaria')
    .select('data, abertura, maxima, minima, fechamento, volume')
    .eq('codigo', codigo).gte('data', desde).order('data').limit(1000);
  if (error) return resposta({ erro: error.message }, 500);
  return resposta({ codigo, fonte, candles: data });
});
