import { animate, motion, useReducedMotion, type Variants } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Animações do app: curtas (até 0,8 s), com saída suave e sem piscar. Quem
 * pede "reduzir movimento" no aparelho vê tudo parado (MotionConfig em main.tsx).
 */

export const SUAVE = [0.16, 1, 0.3, 1] as const;

const grupo: Variants = { oculto: {}, visivel: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } } };
const item: Variants = {
  oculto: { opacity: 0, y: 14 },
  visivel: { opacity: 1, y: 0, transition: { duration: 0.45, ease: SUAVE } },
};

/** Container que faz os filhos `Item` surgirem em sequência. */
export function Grupo({ children, className, como = 'div' }: { children: ReactNode; className?: string; como?: 'div' | 'section' | 'ul' }) {
  const M = motion[como];
  return <M className={className} variants={grupo} initial="oculto" animate="visivel">{children}</M>;
}

export function Item({ children, className, como = 'div' }: { children: ReactNode; className?: string; como?: 'div' | 'article' | 'section' | 'li' }) {
  const M = motion[como];
  return <M className={className} variants={item}>{children}</M>;
}

/** Número que conta até o valor novo (ex.: patrimônio). */
export function NumeroAnimado({ valor, formatar, className }: { valor: number; formatar: (v: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const anterior = useRef<number | null>(null);
  const reduzir = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const de = anterior.current ?? valor * 0.92;
    anterior.current = valor;
    if (reduzir || de === valor) {
      el.textContent = formatar(valor);
      return;
    }
    const controle = animate(de, valor, { duration: 0.9, ease: SUAVE, onUpdate: (v) => (el.textContent = formatar(v)) });
    return () => controle.stop();
  }, [valor, formatar, reduzir]);

  return <span ref={ref} className={className}>{formatar(valor)}</span>;
}

/** Ponto de status que pulsa devagar (mercado aberto, dado ao vivo). */
export function PontoVivo({ ativo = true }: { ativo?: boolean }) {
  return <span className={`ponto-vivo ${ativo ? 'ativo' : ''}`} aria-hidden />;
}
