import { AnimatePresence, motion } from 'framer-motion';
import { Info, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SUAVE } from './movimento';

/** Explicações curtas dos termos que quem está começando não conhece. */
export const GLOSSARIO = {
  selic: 'Taxa básica de juros, definida pelo Banco Central. É o piso do quanto a renda fixa rende.',
  cdi: 'Taxa que os bancos usam entre si. CDBs costumam render um percentual dela, como 100% do CDI.',
  ipca: 'A inflação oficial do Brasil. Mede quanto os preços subiram.',
  jurosReal: 'Quanto a Selic rende acima da inflação. É o ganho de poder de compra.',
  jurosRealEsperado: 'O mesmo cálculo, mas com a inflação que o mercado espera para os próximos 12 meses (pesquisa Focus).',
  dolar: 'Cotação oficial de venda (PTAX), calculada pelo Banco Central.',
  reserva: 'Dinheiro guardado para imprevistos, que você pode sacar no mesmo dia. Vem antes de qualquer outro investimento.',
  rateio: 'Como o app divide seu aporte: primeiro completa a reserva, depois coloca mais nas classes que estão abaixo do alvo.',
  aplicado: 'Quanto você colocou do próprio bolso, sem contar os rendimentos.',
  oportunidade:
    'O app compara o que você tem com os percentuais-alvo que você escolheu. A classe mais abaixo do alvo recebe mais. Não é previsão: a queda de um preço não garante que ele vá subir.',
  media50: 'A média dos preços de fechamento dos últimos 50 dias de bolsa. Estar abaixo dela só quer dizer que o preço está menor que nos últimos meses.',
} as const;

export function Dica({ texto, sobre }: { texto: string; sobre: string }) {
  const id = useId();
  const [aberta, setAberta] = useState(false);
  return (
    <span className="dica" onMouseEnter={() => setAberta(true)} onMouseLeave={() => setAberta(false)}>
      <button type="button" aria-label={`O que é ${sobre}?`} aria-describedby={aberta ? id : undefined}
        onClick={() => setAberta((a) => !a)} onBlur={() => setAberta(false)} onFocus={() => setAberta(true)}>
        <Info size={14} aria-hidden />
      </button>
      <AnimatePresence>
        {aberta && (
          <motion.span role="tooltip" id={id} className="dica-balao"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            {texto}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Painel lateral no notebook e folha de baixo no celular. Fecha com Esc ou clicando fora. */
export function Folha({ aberta, titulo, aoFechar, children }: { aberta: boolean; titulo: string; aoFechar: () => void; children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!aberta) return;
    const anterior = document.activeElement as HTMLElement | null;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    document.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    setTimeout(() => caixa.current?.querySelector<HTMLElement>('input, select, button')?.focus(), 60);
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
      anterior?.focus();
    };
  }, [aberta, aoFechar]);

  const largo = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
  return (
    <AnimatePresence>
      {aberta && (
        <>
          <motion.div className="folha-fundo" onClick={aoFechar} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div ref={caixa} className="folha" role="dialog" aria-modal="true" aria-labelledby={id}
            initial={largo ? { x: '100%' } : { y: '100%' }} animate={largo ? { x: 0 } : { y: 0 }} exit={largo ? { x: '100%' } : { y: '100%' }}
            transition={{ duration: 0.32, ease: SUAVE }}>
            <div className="folha-topo">
              <h2 id={id}>{titulo}</h2>
              <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar"><X size={18} aria-hidden /></button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Saudação pela hora de Brasília. */
export function saudacao(agora = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(agora));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function dataPorExtenso(agora = new Date()): string {
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long' }).format(agora);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
