import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CURSO } from '../conteudo/curso';
import type { DadosCarteira } from '../lib/dados';
import { SUAVE } from './movimento';

interface Passo {
  id: string;
  titulo: string;
  detalhe: string;
  feito: boolean;
  link: string;
  acao: string;
}

const chave = (usuario: string) => `investindo:comece-escondido:${usuario}`;

/**
 * Checklist para quem está começando. Cada passo se marca sozinho a partir do
 * que a pessoa já fez no app; o painel some quando tudo está feito.
 */
export function ComecePorAqui({ d, reservaCompleta }: { d: DadosCarteira; reservaCompleta: boolean }) {
  const [escondido, setEscondido] = useState(() => {
    try {
      return localStorage.getItem(chave(d.perfil.usuario_id)) === '1';
    } catch {
      return false;
    }
  });

  const licoes = d.perfil.licoes_concluidas ?? [];
  const fezAporte = d.movimentacoes.some((m) => m.aporteId);
  const passos: Passo[] = [
    {
      id: 'curso', titulo: 'Entender o básico',
      detalhe: `${licoes.length} de ${CURSO.length} lições do curso rápido`,
      feito: licoes.length >= CURSO.length, link: '/aprender', acao: licoes.length ? 'Continuar o curso' : 'Começar o curso',
    },
    {
      id: 'conta', titulo: 'Abrir conta numa corretora',
      detalhe: 'É grátis e feito pelo celular. A lição 6 mostra o passo a passo.',
      feito: fezAporte || licoes.includes('abrir-conta-comprar'), link: '/aprender/abrir-conta-comprar', acao: 'Ver como fazer',
    },
    {
      id: 'aporte', titulo: 'Fazer o primeiro aporte',
      detalhe: 'O app mostra o que comprar; você compra no banco e confirma aqui.',
      feito: fezAporte, link: '/investir', acao: 'Investir agora',
    },
    {
      id: 'reserva', titulo: 'Completar a reserva de emergência',
      detalhe: 'Acontece com os aportes dos primeiros meses, sem você fazer nada diferente.',
      feito: reservaCompleta, link: '/metas', acao: 'Ver a reserva',
    },
    {
      id: 'meta', titulo: 'Definir uma meta',
      detalhe: 'Uma viagem, um carro, a aposentadoria. Ajuda a manter a constância.',
      feito: d.metas.length > 0, link: '/metas', acao: 'Criar meta',
    },
  ];
  const feitos = passos.filter((p) => p.feito).length;
  const proximo = passos.find((p) => !p.feito);
  if (!proximo || escondido) return null;

  function esconder() {
    setEscondido(true);
    try {
      localStorage.setItem(chave(d.perfil.usuario_id), '1');
    } catch {
      /* sem armazenamento: some só nesta visita */
    }
  }

  return (
    <motion.section className="painel comece" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: SUAVE }}
      aria-labelledby="comece-titulo">
      <div className="painel-titulo">
        <div>
          <h2 id="comece-titulo">Comece por aqui</h2>
          <p className="nota" style={{ marginTop: 4 }}>{feitos} de {passos.length} passos · o próximo está em destaque</p>
        </div>
        <button type="button" className="link-discreto" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={esconder}>Esconder</button>
      </div>
      <div className="comece-barra" aria-hidden><span style={{ width: `${(feitos / passos.length) * 100}%` }} /></div>
      <ol className="comece-lista">
        {passos.map((p) => {
          const atual = p.id === proximo.id;
          return (
            <li key={p.id} data-feito={p.feito} data-atual={atual}>
              <span className="comece-marca" aria-hidden>{p.feito ? <Check size={14} strokeWidth={3} /> : null}</span>
              <div>
                <b>{p.titulo}</b>
                {(atual || !p.feito) && <small>{p.detalhe}</small>}
              </div>
              {!p.feito && (
                <Link to={p.link} className={atual ? 'botao botao-principal' : 'link-discreto'}>
                  {p.acao} {atual && <ArrowRight size={16} aria-hidden />}
                </Link>
              )}
              <span className="visualmente-oculto">{p.feito ? 'feito' : 'pendente'}</span>
            </li>
          );
        })}
      </ol>
    </motion.section>
  );
}
