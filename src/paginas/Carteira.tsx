import { Plus, Receipt } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AvisoCache, AvisoErro, Campo, Carregando, ErroCarga, FonteDado, Selecao, useCoresGrafico, Variacao } from '../componentes/base';
import { Cabecalho } from '../componentes/Estrutura';
import { NumeroAnimado } from '../componentes/movimento';
import { GraficoEvolucao } from '../componentes/graficos';
import { BarraAlocacao } from '../componentes/minigraficos';
import { DESCRICAO_METODO, serieDePatrimonio, type PontoPatrimonio, type Posicao } from '../domain/carteira';
import { COR_CLASSE, NOME_CLASSE, type Classe, type Indexador, type TipoAtivo } from '../domain/tipos';
import { carregarFechamentos } from '../lib/mercado';
import {
  carregarCarteira,
  criarAtivoProprio,
  registrarExtrato,
  registrarMovimentacao,
  rendimentoDoMes,
  resumoDaCarteira,
  useCarregar,
  type DadosCarteira,
} from '../lib/dados';
import { formatarMoeda, formatarPercentual, hojeSP, lerMoeda } from '../lib/formato';
import { useSessao } from '../lib/sessao';

const numeroBR = (s: string) => Number(s.trim().replace(/\./g, '').replace(',', '.'));

function GraficoAlvo({ classes }: { classes: ReturnType<typeof resumoDaCarteira>['classes'] }) {
  const cor = useCoresGrafico();
  const dados = classes
    .filter((c) => c.percentualAlvo !== null)
    .map((c) => ({ nome: NOME_CLASSE[c.classe], Atual: Number(c.percentualAtual.toFixed(1)), Alvo: c.percentualAlvo }));
  return (
    <div style={{ width: '100%', height: 220 }} role="img" aria-label={dados.map((x) => `${x.nome}: ${x.Atual}% atual, alvo ${x.Alvo}%`).join('; ')}>
      <ResponsiveContainer>
        <BarChart data={dados} margin={{ top: 8, right: 0, left: -16, bottom: 0 }} barGap={4}>
          <CartesianGrid vertical={false} stroke={cor.linha} />
          <XAxis dataKey="nome" tick={{ fill: cor['tinta-suave'], fontSize: 12 }} axisLine={{ stroke: cor.linha }} tickLine={false} />
          <YAxis unit="%" tick={{ fill: cor['tinta-suave'], fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: number) => `${v.toLocaleString('pt-BR')}%`} cursor={{ fill: cor.linha, opacity: 0.3 }}
            contentStyle={{ background: cor['superficie-elevada'], border: `1px solid ${cor.linha}`, borderRadius: 4, color: cor.tinta }} />
          <Legend wrapperStyle={{ fontSize: 12, color: cor['tinta-suave'] }} />
          <Bar dataKey="Atual" fill={cor.verde} radius={0} isAnimationActive={false} />
          <Bar dataKey="Alvo" fill={cor['tinta-suave']} radius={0} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LinhaPosicao({ p, aoAtualizar }: { p: Posicao; aoAtualizar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hojeSP());
  const [erro, setErro] = useState<string | null>(null);
  const rendimento = p.valorBruto - p.aplicado;
  const podeExtrato = p.ativo.tipo !== 'etf';

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const v = lerMoeda(valor);
    if (v === null || v < 0) return setErro('Digite o saldo bruto do extrato.');
    try {
      await registrarExtrato(p.ativo.id, data, v / 100);
      setAberto(false);
      aoAtualizar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  }

  return (
    <article className="cartao pilha-curta">
      <div className="linha-entre">
        <strong>{p.ativo.nome}</strong>
        <span className="valor-pequeno">{formatarMoeda(p.valorBruto)}</span>
      </div>
      <div className="linha-entre corpo-pequeno">
        <span className="suave">Aplicado {formatarMoeda(p.aplicado)}</span>
        <Variacao valor={rendimento} percentual={p.aplicado ? (rendimento / p.aplicado) * 100 : 0} />
      </div>
      {p.ativo.tipo === 'etf' && <span className="legenda">{p.quantidade.toLocaleString('pt-BR')} {p.quantidade === 1 ? 'cota' : 'cotas'}</span>}
      <p className="legenda" style={{ margin: 0 }}>
        {DESCRICAO_METODO[p.metodo]} · {p.dataReferencia.split('-').reverse().join('/')}
        {p.irEstimado > 0 && <> · IR estimado se resgatar hoje: {formatarMoeda(p.irEstimado)}</>}
      </p>
      {podeExtrato && !aberto && (
        <button className="botao-link corpo-pequeno" onClick={() => setAberto(true)} style={{ justifySelf: 'start' }}>
          Atualizar pelo extrato do banco
        </button>
      )}
      {aberto && (
        <form className="pilha-curta" onSubmit={salvar}>
          <AvisoErro>{erro}</AvisoErro>
          <div className="grade-cartoes">
            <Campo rotulo="Saldo bruto (R$)" numerico value={valor} onChange={(e) => setValor(e.target.value)} />
            <Campo rotulo="Data do extrato" type="date" value={data} max={hojeSP()} onChange={(e) => setData(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="botao botao-principal">Salvar saldo</button>
            <button type="button" className="botao botao-secundario" onClick={() => setAberto(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */

const NOVO = '__novo__';

function RegistrarMovimentacao({ d, aoSalvar }: { d: DadosCarteira; aoSalvar: () => void }) {
  const [ativoId, setAtivoId] = useState('');
  const [tipo, setTipo] = useState<'compra' | 'venda'>('compra');
  const [data, setData] = useState(hojeSP());
  const [quantidade, setQuantidade] = useState('1');
  const [preco, setPreco] = useState('');
  const [taxa, setTaxa] = useState('');
  const [novo, setNovo] = useState({ nome: '', classe: 'renda_fixa' as Classe, tipo: 'cdb' as TipoAtivo, indexador: 'cdi' as Indexador, vencimento: '', isento: false, liquidez: false });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const ativo = d.ativos.find((a) => a.id === ativoId);
  const indexador = ativoId === NOVO ? novo.indexador : ativo?.indexador;
  const pedeTaxa = ativoId === NOVO || (ativo && ativo.tipo !== 'etf' && ativo.indexador !== 'nenhum');
  const unitario = ativoId === NOVO || (ativo && !['etf', 'tesouro'].includes(ativo.tipo));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const q = unitario ? 1 : numeroBR(quantidade);
    const p = numeroBR(preco);
    if (!ativoId) return setErro('Escolha o ativo.');
    if (ativoId === NOVO && !novo.nome.trim()) return setErro('Dê um nome ao investimento, por exemplo "CDB Banco X 2028".');
    if (!(q > 0) || !(p > 0)) return setErro('Confira quantidade e valor.');
    setSalvando(true);
    try {
      let id = ativoId;
      if (ativoId === NOVO) {
        id = await criarAtivoProprio({
          codigo: novo.nome.trim().toUpperCase().slice(0, 60), nome: novo.nome.trim(), classe: novo.classe, tipo: novo.tipo,
          indexador: novo.indexador, vencimento: novo.vencimento || null, isento_ir: novo.isento, liquidez_diaria: novo.liquidez, emissor: null,
        });
      }
      await registrarMovimentacao({ ativo_id: id, tipo, data, quantidade: q, preco_unitario: p, taxa_contratada: pedeTaxa && taxa.trim() ? numeroBR(taxa) : null });
      aoSalvar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  }

  const catalogo = d.ativos.filter((a) => a.tipo !== 'tesouro' || a.vencimento! > d.hoje);

  return (
    <form className="cartao pilha" onSubmit={salvar}>
      <h2 className="subtitulo">Registrar compra ou venda</h2>
      <AvisoErro>{erro}</AvisoErro>
      <Selecao rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as 'compra' | 'venda')}>
        <option value="compra">Compra</option>
        <option value="venda">Venda ou resgate</option>
      </Selecao>
      <Selecao rotulo="Ativo" value={ativoId} onChange={(e) => setAtivoId(e.target.value)}>
        <option value="">Escolha…</option>
        {tipo === 'compra' && <option value={NOVO}>+ Cadastrar CDB, LCI/LCA ou outro</option>}
        {(['reserva', 'renda_fixa', 'acoes_br', 'exterior'] as Classe[]).map((c) => (
          <optgroup key={c} label={NOME_CLASSE[c]}>
            {catalogo.filter((a) => a.classe === c).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </optgroup>
        ))}
      </Selecao>

      {ativoId === NOVO && (
        <div className="pilha" style={{ borderTop: '1px solid var(--linha)', paddingTop: 16 }}>
          <Campo rotulo="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="CDB Banco X 2028" maxLength={120} />
          <div className="grade-cartoes">
            <Selecao rotulo="Classe" value={novo.classe} onChange={(e) => setNovo({ ...novo, classe: e.target.value as Classe })}>
              <option value="reserva">Reserva de emergência</option>
              <option value="renda_fixa">Renda fixa longa</option>
            </Selecao>
            <Selecao rotulo="Tipo" value={novo.tipo} onChange={(e) => { const t = e.target.value as TipoAtivo; setNovo({ ...novo, tipo: t, isento: t === 'lci_lca' }); }}>
              <option value="cdb">CDB</option>
              <option value="lci_lca">LCI / LCA (isenta de IR)</option>
              <option value="outro">Outro</option>
            </Selecao>
            <Selecao rotulo="Rende" value={novo.indexador} onChange={(e) => setNovo({ ...novo, indexador: e.target.value as Indexador })}>
              <option value="cdi">% do CDI</option>
              <option value="pre">Prefixado</option>
              <option value="ipca">IPCA + taxa</option>
              <option value="nenhum">Não sei (atualizo pelo extrato)</option>
            </Selecao>
            <Campo rotulo="Vencimento" type="date" value={novo.vencimento} onChange={(e) => setNovo({ ...novo, vencimento: e.target.value })} />
          </div>
          <label className="corpo-pequeno" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
            <input type="checkbox" checked={novo.liquidez} onChange={(e) => setNovo({ ...novo, liquidez: e.target.checked })} style={{ width: 20, height: 20 }} />
            Posso resgatar a qualquer dia (liquidez diária)
          </label>
        </div>
      )}

      <div className="grade-cartoes">
        <Campo rotulo="Data" type="date" value={data} max={hojeSP()} onChange={(e) => setData(e.target.value)} />
        {!unitario && <Campo rotulo={ativo?.tipo === 'etf' ? 'Cotas' : 'Quantidade'} numerico value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />}
        <Campo rotulo={unitario ? 'Valor aplicado (R$)' : 'Preço por unidade (R$)'} numerico value={preco} onChange={(e) => setPreco(e.target.value)} />
        {pedeTaxa && (
          <Campo
            rotulo={indexador === 'cdi' || indexador === 'selic' ? '% do índice' : 'Taxa (% a.a.)'}
            numerico value={taxa} onChange={(e) => setTaxa(e.target.value)}
            ajuda={indexador === 'cdi' ? 'Ex.: 102 para 102% do CDI.' : indexador === 'ipca' ? 'Só a parte real, ex.: 6,5 para IPCA + 6,5%.' : undefined}
          />
        )}
      </div>
      <button className="botao botao-principal botao-largo" disabled={salvando}>{salvando ? 'Salvando…' : 'Registrar'}</button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

export default function Carteira() {
  const { sessao } = useSessao();
  const r = useCarregar(sessao ? `carteira:${sessao.user.id}` : null, carregarCarteira);
  const [registrando, setRegistrando] = useState(false);
  const [doMes, setDoMes] = useState<number | null>(null);

  const resumo = r.dados ? resumoDaCarteira(r.dados) : null;
  const [evolucao, setEvolucao] = useState<PontoPatrimonio[] | null>(null);
  useEffect(() => {
    if (r.dados && resumo && !r.doCacheDe) rendimentoDoMes(r.dados, resumo.total).then(setDoMes).catch(() => setDoMes(null));
    if (r.dados) {
      const d = r.dados;
      const ids = new Set(d.movimentacoes.map((m) => m.ativoId));
      const codigos = d.ativos.filter((a) => ids.has(a.id)).map((a) => a.codigo);
      const desde = d.movimentacoes[0]?.data ?? d.hoje;
      carregarFechamentos(codigos, desde)
        .then((f) => setEvolucao(serieDePatrimonio(d.ativos, d.movimentacoes, d.extratos, f, d.mercado, d.hoje)))
        .catch(() => setEvolucao(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.dados]);

  if (r.carregando && !r.dados) return <><Cabecalho sobretitulo="Carteira" /><main className="pagina"><Carregando /></main></>;
  if (!r.dados || !resumo) return <><Cabecalho sobretitulo="Carteira" /><main className="pagina"><ErroCarga mensagem={r.erro ?? ''} tentarDeNovo={r.recarregar} /></main></>;
  const d = r.dados;
  const rendimento = resumo.total - resumo.totalAplicado;

  return (
    <>
      <Cabecalho sobretitulo="Carteira" valor={<NumeroAnimado valor={resumo.total} formatar={(v) => formatarMoeda(Math.round(v))} />}>
        {resumo.totalAplicado > 0 && <Variacao valor={rendimento} percentual={(rendimento / resumo.totalAplicado) * 100} />}
      </Cabecalho>
      <main className="pagina">
        <AvisoCache salvoEm={r.doCacheDe} />

        {resumo.posicoes.length === 0 && !registrando && (
          <div className="cartao pilha">
            <h2 className="subtitulo">Sua carteira está vazia</h2>
            <p className="suave">Faça o primeiro aporte em Investir, ou registre o que você já tem.</p>
          </div>
        )}

        {resumo.posicoes.length > 0 && (
          <>
            <section className="grade-cartoes">
              <article className="cartao pilha-curta">
                <h3 className="sobretitulo suave">Rendimento no mês</h3>
                {doMes === null ? <p className="valor-medio">—</p> : <Variacao valor={doMes} percentual={resumo.total ? (doMes / (resumo.total - doMes)) * 100 : 0} />}
              </article>
              <article className="cartao pilha-curta">
                <h3 className="sobretitulo suave">Desde o início</h3>
                <Variacao valor={rendimento} percentual={resumo.totalAplicado ? (rendimento / resumo.totalAplicado) * 100 : 0} />
              </article>
            </section>

            <section className="cartao pilha">
              <div className="linha-entre">
                <h2 className="subtitulo">Evolução do patrimônio</h2>
                <span className="legenda"><i className="traco-legenda" style={{ background: 'var(--verde)' }} />Valor <i className="traco-legenda" style={{ background: 'var(--tinta-suave)' }} />Aplicado</span>
              </div>
              {evolucao === null && <div className="esqueleto" style={{ height: 240 }} />}
              {evolucao && evolucao.length >= 2 && <GraficoEvolucao pontos={evolucao} />}
              {evolucao && evolucao.length < 2 && (
                <p className="corpo-pequeno suave">O gráfico aparece a partir do segundo pregão com investimentos. Volte amanhã.</p>
              )}
              <p className="legenda">Fechamento de cada pregão. ETFs pela cotação do dia; Tesouro pelo preço de resgate; CDB pela curva da taxa contratada.</p>
            </section>

            <section className="cartao pilha">
              <h2 className="subtitulo">Alocação</h2>
              <BarraAlocacao partes={resumo.classes.map((c) => ({ rotulo: NOME_CLASSE[c.classe], valor: c.valorBruto, cor: COR_CLASSE[c.classe] }))} />
            </section>

            <section className="cartao pilha">
              <h2 className="subtitulo">Atual × alvo</h2>
              <GraficoAlvo classes={resumo.classes} />
              <table className="tabela corpo-pequeno">
                <thead><tr><th>Classe</th><th className="num">Valor</th><th className="num">Atual</th><th className="num">Alvo</th></tr></thead>
                <tbody>
                  {resumo.classes.map((c) => (
                    <tr key={c.classe}>
                      <td>{NOME_CLASSE[c.classe]}</td>
                      <td className="num">{formatarMoeda(c.valorBruto)}</td>
                      <td className="num">{c.percentualAlvo === null ? '—' : formatarPercentual(c.percentualAtual, 1)}</td>
                      <td className="num">{c.percentualAlvo === null ? '—' : formatarPercentual(c.percentualAlvo, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="legenda">Percentuais sobre o investido, sem a reserva. Valores brutos, antes do IR.</p>
            </section>

            <section className="pilha">
              <h2 className="subtitulo">Seus investimentos</h2>
              {resumo.posicoes.map((p) => <LinhaPosicao key={p.ativo.id} p={p} aoAtualizar={r.recarregar} />)}
              {d.precos[d.perfil.etf_acoes_br] && (
                <FonteDado fonte={d.precos[d.perfil.etf_acoes_br].fonte} data={d.precos[d.perfil.etf_acoes_br].data} />
              )}
            </section>
          </>
        )}

        {registrando ? (
          <RegistrarMovimentacao d={d} aoSalvar={() => { setRegistrando(false); r.recarregar(); }} />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <button className="botao botao-secundario botao-largo" onClick={() => setRegistrando(true)}>
              <Plus size={20} className="icone" aria-hidden /> Registrar compra ou venda
            </button>
            <p className="legenda" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <Receipt size={16} className="icone" aria-hidden /> Para CDB e LCI, o valor mais fiel é o do extrato do banco.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
