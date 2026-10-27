import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AvisoCache, AvisoErro, BarraReserva, Campo, Carregando, ErroCarga, useCoresGrafico } from '../componentes/base';
import { Cabecalho } from '../componentes/Estrutura';
import { JURO_REAL_PROJECAO, projetarPatrimonio } from '../domain/metas';
import { apagarMeta, carregarCarteira, resumoDaCarteira, salvarMeta, useCarregar } from '../lib/dados';
import { formatarData, formatarMoeda, formatarMoedaCurta, formatarPercentual, hojeSP, lerMoeda } from '../lib/formato';
import { useSessao } from '../lib/sessao';

export default function Metas() {
  const { sessao } = useSessao();
  const r = useCarregar(sessao ? `carteira:${sessao.user.id}` : null, carregarCarteira);
  const [aporteTexto, setAporteTexto] = useState('700,00');
  const [nova, setNova] = useState({ nome: '', valor: '', prazo: '' });
  const [erro, setErro] = useState<string | null>(null);
  const cor = useCoresGrafico();

  if (r.carregando && !r.dados) return <><Cabecalho sobretitulo="Metas" /><main className="pagina"><Carregando /></main></>;
  if (!r.dados) return <><Cabecalho sobretitulo="Metas" /><main className="pagina"><ErroCarga mensagem={r.erro ?? ''} tentarDeNovo={r.recarregar} /></main></>;

  const d = r.dados;
  const resumo = resumoDaCarteira(d);
  const aporte = lerMoeda(aporteTexto) ?? 0;
  const juro = JURO_REAL_PROJECAO[d.perfil.tipo_perfil];
  const falta = Math.max(0, resumo.metaReserva - resumo.totalReserva);
  const mesesParaReserva = aporte > 0 ? Math.ceil(falta / aporte) : null;
  const pontos = Array.from({ length: 21 }, (_, ano) => ({ ano, valor: projetarPatrimonio(resumo.total, aporte, ano, juro) }));

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    const valor = lerMoeda(nova.valor);
    if (!nova.nome.trim() || !valor || valor <= 0) return setErro('Dê um nome e um valor à meta.');
    if (nova.prazo && nova.prazo <= hojeSP()) return setErro('O prazo precisa ser uma data futura.');
    try {
      await salvarMeta({ nome: nova.nome.trim(), valor_alvo: valor / 100, prazo: nova.prazo || null });
      setNova({ nome: '', valor: '', prazo: '' });
      setErro(null);
      r.recarregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  }

  return (
    <>
      <Cabecalho sobretitulo="Metas" />
      <main className="pagina">
        <AvisoCache salvoEm={r.doCacheDe} />

        <section className="cartao pilha">
          <h2 className="subtitulo">Reserva de emergência</h2>
          <div className="linha-entre">
            <span className="valor-medio">{formatarMoeda(resumo.totalReserva)}</span>
            <span className="valor-pequeno suave">de {formatarMoeda(resumo.metaReserva)}</span>
          </div>
          <BarraReserva saldo={resumo.totalReserva} meta={resumo.metaReserva} />
          <p className="corpo-pequeno suave">
            {d.perfil.meses_reserva} meses de gastos de {formatarMoeda(Math.round(Number(d.perfil.gasto_mensal) * 100))}.
            {falta > 0 && mesesParaReserva !== null && <> Com {formatarMoeda(aporte)} por mês, completa em {mesesParaReserva} {mesesParaReserva === 1 ? 'mês' : 'meses'}.</>}
          </p>
        </section>

        <section className="cartao pilha">
          <h2 className="subtitulo">Patrimônio no futuro</h2>
          <Campo rotulo="Aporte mensal (R$)" numerico value={aporteTexto} onChange={(e) => setAporteTexto(e.target.value)} />
          <div style={{ width: '100%', height: 200 }} role="img" aria-label="Projeção de patrimônio em 20 anos">
            <ResponsiveContainer>
              <LineChart data={pontos} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={cor.linha} />
                <XAxis dataKey="ano" tickFormatter={(a) => `${a}a`} tick={{ fill: cor['tinta-suave'], fontSize: 12 }} axisLine={{ stroke: cor.linha }} tickLine={false} />
                <YAxis tickFormatter={(v) => formatarMoedaCurta(v)} width={80} tick={{ fill: cor['tinta-suave'], fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => formatarMoeda(v)} labelFormatter={(a) => `Em ${a} anos`}
                  contentStyle={{ background: cor['superficie-elevada'], border: `1px solid ${cor.linha}`, borderRadius: 4, color: cor.tinta }} />
                <Line type="linear" dataKey="valor" stroke={cor.verde} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table className="tabela">
            <tbody>
              {[5, 10, 20].map((anos) => (
                <tr key={anos}>
                  <td>Em {anos} anos</td>
                  <td className="num valor-medio">{formatarMoeda(projetarPatrimonio(resumo.total, aporte, anos, juro))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="legenda">
            Em valores de hoje, supondo juro real de {formatarPercentual(juro, 0)} a.a. (hipótese para o perfil {d.perfil.tipo_perfil}).
            É uma estimativa para planejar, não uma promessa de retorno.
          </p>
        </section>

        <section className="pilha">
          <h2 className="subtitulo">Suas metas</h2>
          {d.metas.length === 0 && <p className="suave corpo-pequeno">Nenhuma meta ainda. Uma viagem, a entrada de um imóvel, a aposentadoria.</p>}
          {d.metas.map((m) => {
            const alvo = Math.round(m.valor_alvo * 100);
            return (
              <article key={m.id} className="cartao pilha-curta">
                <div className="linha-entre">
                  <strong>{m.nome}</strong>
                  <button className="botao-link" aria-label={`Apagar a meta ${m.nome}`} onClick={() => apagarMeta(m.id).then(r.recarregar)}>
                    <Trash2 size={20} className="icone" aria-hidden />
                  </button>
                </div>
                <BarraReserva saldo={resumo.totalInvestido} meta={alvo} />
                <p className="legenda">{formatarMoeda(resumo.totalInvestido)} de {formatarMoeda(alvo)}{m.prazo && <> · até {formatarData(m.prazo)}</>}</p>
              </article>
            );
          })}
          <form className="cartao pilha" onSubmit={adicionar}>
            <AvisoErro>{erro}</AvisoErro>
            <Campo rotulo="Nova meta" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="Entrada do apartamento" maxLength={80} />
            <div className="grade-cartoes">
              <Campo rotulo="Valor (R$)" numerico value={nova.valor} onChange={(e) => setNova({ ...nova, valor: e.target.value })} />
              <Campo rotulo="Até quando" type="date" value={nova.prazo} min={hojeSP()} onChange={(e) => setNova({ ...nova, prazo: e.target.value })} />
            </div>
            <button className="botao botao-secundario">Adicionar meta</button>
          </form>
        </section>
      </main>
    </>
  );
}
