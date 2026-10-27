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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* "user": quem ativou "reduzir movimento" no aparelho vê as telas sem animação. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
