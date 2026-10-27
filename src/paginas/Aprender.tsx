import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Search, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CabecalhoPagina } from '../componentes/Estrutura';
import { SUAVE } from '../componentes/movimento';
import { CURSO, MINUTOS_TOTAIS, TERMOS, type Licao } from '../conteudo/curso';
import { carregarPerfil, concluirLicao, useCarregar } from '../lib/dados';

/* ------------------------------------------------------------------ */
/* Lista de lições                                                     */
/* ------------------------------------------------------------------ */

export function Aprender() {
  const perfil = useCarregar(null, carregarPerfil);
  const feitas = new Set(perfil.dados?.licoes_concluidas ?? []);
  const proxima = CURSO.find((l) => !feitas.has(l.id));
  const pct = Math.round((feitas.size / CURSO.length) * 100);
  const [busca, setBusca] = useState('');
  const termos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? TERMOS.filter(([t, d]) => `${t} ${d}`.toLowerCase().includes(q)) : TERMOS;
  }, [busca]);

  return (
    <>
      <CabecalhoPagina contexto={`${CURSO.length} lições curtas · cerca de ${MINUTOS_TOTAIS} minutos`} titulo="Do zero ao primeiro aporte" />

      <div className="grade">
        <section className="destaque n-8">
          <div style={{ display: 'grid', gap: 8 }}>
            <span className="rotulo">Seu progresso</span>
            <span style={{ font: '600 1.75rem/1.1 var(--fonte-mono)' }}>{feitas.size} de {CURSO.length} lições</span>
          </div>
          <div className="barra-curso" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do curso">
            <motion.span initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: SUAVE }} />
          </div>
          {proxima ? (
            <Link to={`/aprender/${proxima.id}`} className="botao botao-claro" style={{ justifySelf: 'start' }}>
              {feitas.size === 0 ? 'Começar pela primeira lição' : `Continuar: ${proxima.titulo}`} <ArrowRight size={18} aria-hidden />
            </Link>
          ) : (
            <p style={{ margin: 0 }}>Você concluiu o curso. Agora é colocar em prática: <Link to="/investir" style={{ color: '#3DCB85' }}>fazer um aporte</Link>.</p>
          )}
        </section>

        <aside className="painel n-4">
          <div className="painel-titulo"><h2>Para quem é</h2></div>
          <p className="corpo-pequeno" style={{ margin: 0 }}>
            Para quem nunca investiu. Sem jargão: cada termo é explicado na hora. No fim de cada lição há uma pergunta rápida
            para fixar a ideia.
          </p>
          <p className="nota">Conteúdo educativo. Não é recomendação de investimento.</p>
        </aside>

        <section className="painel n-12">
          <div className="painel-titulo"><h2>Lições</h2></div>
          <ol className="lista-licoes">
            {CURSO.map((l, i) => {
              const feita = feitas.has(l.id);
              return (
                <li key={l.id}>
                  <Link to={`/aprender/${l.id}`} data-feita={feita}>
                    <span className="licao-numero" aria-hidden>{feita ? <CheckCircle2 size={22} /> : i + 1}</span>
                    <span className="licao-texto">
                      <b>{l.titulo}</b>
                      <small>{l.resumo}</small>
                    </span>
                    <span className="licao-tempo">{feita ? 'Concluída' : `${l.minutos} min`}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="painel n-12" id="glossario">
          <div className="painel-titulo"><h2>Glossário</h2></div>
          <label className="busca">
            <Search size={18} aria-hidden />
            <span className="visualmente-oculto">Buscar termo</span>
            <input type="search" placeholder="Buscar um termo, como CDI ou ETF" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <dl className="glossario">
            {termos.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
          </dl>
          {termos.length === 0 && <p className="corpo-pequeno suave" style={{ margin: 0 }}>Nenhum termo encontrado.</p>}
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Uma lição                                                           */
/* ------------------------------------------------------------------ */

function Quiz({ licao, jaFeita, aoAcertar }: { licao: Licao; jaFeita: boolean; aoAcertar: () => void }) {
  const [escolha, setEscolha] = useState<number | null>(null);
  const p = licao.pergunta;
  const respondeu = escolha !== null;
  const acertou = escolha === p.correta;

  useEffect(() => {
    setEscolha(null);
  }, [licao.id]);

  return (
    <section className="quiz" aria-labelledby="quiz-titulo">
      <h2 id="quiz-titulo">Teste rápido</h2>
      <p style={{ margin: 0, fontWeight: 500 }}>{p.enunciado}</p>
      <div className="quiz-opcoes" role="radiogroup">
        {p.opcoes.map((o, i) => {
          const estado = !respondeu ? '' : i === p.correta ? 'certa' : i === escolha ? 'errada' : '';
          return (
            <button key={o} type="button" role="radio" aria-checked={escolha === i} data-estado={estado}
              onClick={() => {
                setEscolha(i);
                if (i === p.correta && !jaFeita) aoAcertar();
              }}>
              {estado === 'certa' ? <CheckCircle2 size={18} aria-hidden /> : estado === 'errada' ? <XCircle size={18} aria-hidden /> : <Circle size={18} aria-hidden />}
              <span>{o}</span>
            </button>
          );
        })}
      </div>
      {respondeu && (
        <motion.p className={`quiz-retorno ${acertou ? 'certo' : 'errado'}`} role="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
          <b>{acertou ? 'Isso mesmo!' : 'Quase.'}</b> {p.explicacao} {!acertou && 'Tente de novo.'}
        </motion.p>
      )}
    </section>
  );
}

export function LicaoPagina() {
  const { id } = useParams();
  const navegar = useNavigate();
  const perfil = useCarregar(null, carregarPerfil);
  const [feitas, setFeitas] = useState<string[] | null>(null);
  const indice = CURSO.findIndex((l) => l.id === id);
  const licao = CURSO[indice];
  const lista = feitas ?? perfil.dados?.licoes_concluidas ?? [];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  if (!licao) {
    return (
      <>
        <CabecalhoPagina titulo="Lição não encontrada" />
        <Link to="/aprender" className="link-discreto">Voltar para o curso</Link>
      </>
    );
  }

  const anterior = CURSO[indice - 1];
  const proxima = CURSO[indice + 1];
  const jaFeita = lista.includes(licao.id);

  return (
    <article className="licao">
      <Link to="/aprender" className="link-discreto"><ArrowLeft size={16} aria-hidden /> Curso</Link>
      <CabecalhoPagina contexto={`Lição ${indice + 1} de ${CURSO.length} · ${licao.minutos} min de leitura`} titulo={licao.titulo} />
      <div className="licao-corpo">{licao.conteudo()}</div>

      <Quiz licao={licao} jaFeita={jaFeita} aoAcertar={() => concluirLicao(licao.id).then(setFeitas).catch(() => undefined)} />

      <nav className="licao-navegacao" aria-label="Lições">
        {anterior ? <Link to={`/aprender/${anterior.id}`} className="botao botao-secundario"><ArrowLeft size={18} aria-hidden /> Anterior</Link> : <span />}
        {proxima
          ? <button className="botao botao-principal" onClick={() => navegar(`/aprender/${proxima.id}`)}>Próxima: {proxima.titulo} <ArrowRight size={18} aria-hidden /></button>
          : <Link to="/investir" className="botao botao-principal">Fazer meu primeiro aporte <ArrowRight size={18} aria-hidden /></Link>}
      </nav>
    </article>
  );
}
