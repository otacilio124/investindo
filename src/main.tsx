import { MotionConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/layout.css';
import './styles/curso.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* "user": quem ativou "reduzir movimento" no aparelho vê as telas sem animação. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
