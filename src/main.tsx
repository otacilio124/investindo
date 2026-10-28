import { MotionConfig } from 'framer-motion';
import { registerSW } from 'virtual:pwa-register';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/layout.css';
import './styles/curso.css';
import './styles/visual.css';

// Versão nova publicada: o service worker troca e a página recarrega sozinha,
// para ninguém ficar preso numa versão antiga guardada em cache.
registerSW({ immediate: true });

// Quem estava com a página aberta durante uma publicação pede pedaços (chunks)
// da versão anterior, que já não existem. Recarrega uma vez para pegar a nova;
// a marca na sessão evita recarregar em loop se o problema for outro.
window.addEventListener('vite:preloadError', (evento) => {
  const chave = 'investindo:recarregou-versao';
  try {
    if (sessionStorage.getItem(chave)) return;
    sessionStorage.setItem(chave, String(Date.now()));
  } catch {
    /* sem sessionStorage: recarrega mesmo assim, uma vez por carregamento */
  }
  evento.preventDefault();
  window.location.reload();
});
window.addEventListener('load', () => {
  // Página carregou bem: libera um novo recarregamento automático no futuro.
  setTimeout(() => {
    try {
      sessionStorage.removeItem('investindo:recarregou-versao');
    } catch {
      /* nada a fazer */
    }
  }, 10_000);
});

// Avisa o resgate do index.html que o app carregou (não precisa limpar nada).
(window as Window & { __investindoMontou?: boolean }).__investindoMontou = true;
try {
  sessionStorage.removeItem('investindo:resgate');
} catch {
  /* sem armazenamento */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* "user": quem ativou "reduzir movimento" no aparelho vê as telas sem animação. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);

/**
 * A abertura do index.html fica por cima enquanto o app ainda está no
 * "Carregando…" de tela cheia, e só sai quando o símbolo está completo (todas
 * as barras em pé e o "!"), nunca no meio da subida. O ciclo tem 1,8 s e o
 * símbolo fica inteiro entre 0,9 s e 1,15 s de cada volta.
 */
function fecharAbertura() {
  const abertura = document.getElementById('abertura');
  const raiz = document.getElementById('root');
  if (!abertura || !raiz) return;
  const CICLO = 1800;
  const COMPLETO_DE = 900;
  const COMPLETO_ATE = 1150;
  const animacao = abertura.querySelector('.sa-1')?.getAnimations?.()[0];
  let fechando = false;

  const sair = () => {
    abertura.classList.add('saindo');
    abertura.setAttribute('aria-hidden', 'true');
    setTimeout(() => abertura.remove(), 400);
  };
  const tentar = (forcar = false) => {
    const pronto = raiz.childElementCount > 0 && !raiz.querySelector('.centro-tela > .carregador');
    if (fechando || (!pronto && !forcar)) return;
    fechando = true;
    observador.disconnect();
    // Sem animação (reduzir movimento): sai assim que o app estiver pronto.
    const t = Number(animacao?.currentTime ?? NaN);
    if (!animacao || Number.isNaN(t)) return sair();
    const p = t % CICLO;
    setTimeout(sair, p >= COMPLETO_DE && p <= COMPLETO_ATE ? 0 : (COMPLETO_DE - p + CICLO) % CICLO);
  };

  const observador = new MutationObserver(() => tentar());
  observador.observe(raiz, { childList: true, subtree: true });
  tentar();
  // Se a sessão demorar demais, mostra o app (com o carregador dele) mesmo assim.
  setTimeout(() => tentar(true), 6000);
}
fecharAbertura();
