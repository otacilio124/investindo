import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, GraduationCap, HandCoins, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { MINUTOS_TOTAIS } from '../conteudo/curso';
import { carregarPerfil, salvarPerfil } from '../lib/dados';
import { useSessao } from '../lib/sessao';
import { SUAVE } from './movimento';

interface Tela {
  icone: ReactNode;
  titulo: string;
  texto: ReactNode;
}

const TELAS: Tela[] = [
  {
    icone: <Sparkles size={28} aria-hidden />,
    titulo: 'Bem-vindo ao Investindo!',
    texto: <>Aqui você aprende a investir do zero e monta seu patrimônio aos poucos, todo mês. Não precisa entender de mercado financeiro para começar.</>,
  },
  {
    icone: <HandCoins size={28} aria-hidden />,
    titulo: 'Como funciona',
    texto: (
      <ol className="bv-passos">
        <li><b>Você diz quanto vai investir no mês.</b> Pode ser R$ 100.</li>
        <li><b>O app mostra o que comprar e por quê</b>, começando pela sua reserva de emergência.</li>
        <li><b>Você compra no seu banco e confirma aqui.</b> A carteira se atualiza sozinha.</li>
      </ol>
    ),
  },
  {
    icone: <ShieldCheck size={28} aria-hidden />,
    titulo: 'Você continua no controle',
    texto: <>O app nunca mexe no seu dinheiro e não pede senha de banco. Ele só calcula e organiza; quem decide e compra é você. E ele nunca promete lucro: quedas fazem parte, e o plano já conta com elas.</>,
  },
  {
    icone: <GraduationCap size={28} aria-hidden />,
    titulo: 'Comece pelo curso rápido',
    texto: <>São lições curtas, com cerca de {MINUTOS_TOTAIS} minutos no total, explicando tudo com exemplos: o que é investir, reserva, Tesouro, ações e como fazer a primeira compra.</>,
  },
];

/** Apresentação curta, mostrada uma única vez depois do questionário de perfil. */
export function BoasVindas() {
  const { sessao } = useSessao();
  const navegar = useNavigate();
  const [aberta, setAberta] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!sessao) return;
    carregarPerfil()
      .then((p) => setAberta(p.onboarding_concluido && !p.tutorial_visto_em))
      .catch(() => undefined);
  }, [sessao]);

  function fechar(destino?: string) {
    setAberta(false);
    salvarPerfil({ tutorial_visto_em: new Date().toISOString() }).catch(() => undefined);
    if (destino) navegar(destino);
  }

  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
      if (e.key === 'ArrowRight') setI((v) => Math.min(TELAS.length - 1, v + 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta]);

  const ultima = i === TELAS.length - 1;
  const tela = TELAS[i];

  return (
    <AnimatePresence>
      {aberta && (
        <motion.div className="bv-fundo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="bv-caixa" role="dialog" aria-modal="true" aria-labelledby="bv-titulo"
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.35, ease: SUAVE }}>
            <button type="button" className="bv-pular" onClick={() => fechar()}>Pular</button>
            <AnimatePresence mode="wait">
              <motion.div key={i} className="bv-tela" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }}>
                <span className="bv-icone">{tela.icone}</span>
                <h2 id="bv-titulo">{tela.titulo}</h2>
                <div className="bv-texto">{tela.texto}</div>
              </motion.div>
            </AnimatePresence>
            <div className="bv-pontos" aria-label={`Tela ${i + 1} de ${TELAS.length}`}>
              {TELAS.map((_, k) => <span key={k} data-ativo={k === i} />)}
            </div>
            <div className="bv-acoes">
              {i > 0 ? <button type="button" className="botao botao-secundario" onClick={() => setI(i - 1)}><ArrowLeft size={18} aria-hidden /> Voltar</button> : <span />}
              {ultima ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button type="button" className="botao botao-secundario" onClick={() => fechar()}>Explorar sozinho</button>
                  <button type="button" className="botao botao-principal" onClick={() => fechar('/aprender/o-que-e-investir')}>Começar o curso <ArrowRight size={18} aria-hidden /></button>
                </div>
              ) : (
                <button type="button" className="botao botao-principal" onClick={() => setI(i + 1)} autoFocus>Continuar <ArrowRight size={18} aria-hidden /></button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
