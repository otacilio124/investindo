import { supabase } from './supabase';

/**
 * Notificações no celular (Web Push). O service worker do app recebe o aviso
 * (public/push-sw.js) e a função "alertas" decide quando mandar. No iPhone só
 * funciona com o app instalado na tela de início (iOS 16.4 ou mais novo).
 */

export type EstadoPush = 'sem-suporte' | 'precisa-instalar' | 'bloqueado' | 'desligado' | 'ligado';

const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalado = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  // Em desenvolvimento (vite dev) não há service worker: não espera para sempre.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((ok) => setTimeout(() => ok(null), 4000)),
  ]);
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!('PushManager' in window) || !('Notification' in window)) return ehIOS() && !instalado() ? 'precisa-instalar' : 'sem-suporte';
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await registro();
  if (!reg) return 'sem-suporte';
  return (await reg.pushManager.getSubscription()) ? 'ligado' : 'desligado';
}

/** Chave pública VAPID em base64url → bytes, como o PushManager pede. */
function chaveEmBytes(base64url: string): Uint8Array {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

const nomeDoAparelho = () => {
  const ua = navigator.userAgent;
  const so = /android/i.test(ua) ? 'Android' : ehIOS() ? 'iPhone' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : 'Outro';
  const nav = /edg\//i.test(ua) ? 'Edge' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'navegador';
  return `${nav} no ${so}`;
};

export async function ligarPush(): Promise<void> {
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') throw new Error('Permita as notificações quando o navegador perguntar.');
  const reg = await registro();
  if (!reg) throw new Error('Este navegador não aceita notificações do app.');

  const { data, error } = await supabase.functions.invoke('alertas', { method: 'GET' });
  const chave = (data as { chavePublica?: string } | null)?.chavePublica;
  if (error || !chave) throw new Error('Os avisos ainda não estão configurados no servidor.');

  const inscricao =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveEmBytes(chave) }));
  const json = inscricao.toJSON();
  const { error: erroGravar } = await supabase.from('inscricao_push').upsert({
    endpoint: inscricao.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    aparelho: nomeDoAparelho(),
  });
  if (erroGravar) throw new Error('Não foi possível salvar este aparelho. Tente de novo.');
}

export async function desligarPush(): Promise<void> {
  const reg = await registro();
  const inscricao = await reg?.pushManager.getSubscription();
  if (!inscricao) return;
  await supabase.from('inscricao_push').delete().eq('endpoint', inscricao.endpoint);
  await inscricao.unsubscribe();
}

export async function enviarTeste(): Promise<number> {
  const { data, error } = await supabase.functions.invoke('alertas', { body: { teste: true } });
  if (error) throw new Error('Não foi possível mandar o teste agora.');
  return (data as { enviados?: number }).enviados ?? 0;
}
