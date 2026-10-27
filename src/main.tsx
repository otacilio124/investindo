import { MotionConfig } from 'framer-motion';
import { registerSW } from 'virtual:pwa-register';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/layout.css';
import './styles/curso.css';

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* "user": quem ativou "reduzir movimento" no aparelho vê as telas sem animação. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
