import { Download, Landmark, Plus, Receipt } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AvisoCache, AvisoErro, Campo, ErroCarga, Selecao } from '../componentes/base';
import { CabecalhoPagina } from '../componentes/Estrutura';
import { GraficoEvolucao } from '../componentes/graficos';
import { BarraAlocacao, GraficoAportes } from '../componentes/minigraficos';
import { Dica, Folha, GLOSSARIO } from '../componentes/ui';
import { aportesPorMes, DESCRICAO_METODO, type Posicao } from '../domain/carteira';
import { CLASSES_INVESTIMENTO, COR_CLASSE, NOME_CLASSE, type Classe, type Indexador, type TipoAtivo } from '../domain/tipos';
import {
  carregarCarteira,
  criarAtivoProprio,
  movimentacoesEmCSV,
  registrarExtrato,
  registrarMovimentacao,
  rendimentoDoMes,
  resumoDaCarteira,
  useCarregar,
  type DadosCarteira,
} from '../lib/dados';
import { useEvolucao } from '../lib/evolucao';
import { useReferencias } from '../lib/simulacoes';

const sinalPct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
import { formatarData, formatarMoeda, formatarPercentual, hojeSP, lerMoeda } from '../lib/formato';
import { useSessao } from '../lib/sessao';

const TODAS_CLASSES: Classe[] = ['reserva', ...CLASSES_INVESTIMENTO];

const nomeMes = (mes: string, estilo: 'short' | 'long') =>
  new Date(`${mes}-15T12:00:00Z`).toLocaleDateString('pt-BR', estilo === 'short' ? { month: 'short', timeZone: 'UTC' } : { month: 'long', year: 'numeric', timeZone: 'UTC' }).replace('.', '');

const numeroBR = (s: string) => Number(s.trim().replace(/\./g, '').replace(',', '.'));

function Resultado({ valor, base }: { valor: number; base: number }) {
  const pct = base ? (valor / base) * 100 : 0;
  const cls = valor === 0 ? 'neutra' : valor > 0 ? 'alta' : 'queda';
  return (
    <span className={cls}>
      {valor === 0 ? '— ' : valor > 0 ? '▲ ' : '▼ '}{formatarMoeda(Math.abs(valor))}
      <small style={{ display: 'block', fontSize: '0.75rem' }}>{valor >= 0 ? '+' : '−'}{formatarPercentual(Math.abs(pct))}</small>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Atualizar pelo extrato                                              */
/* ------------------------------------------------------------------ */

function FormExtrato({ p, aoSalvar }: { p: Posicao; aoSalvar: () => void }) {
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hojeSP());
  const [erro, setErro] = useState<string | null>(null);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    const v = lerMoeda(valor);
    if (v === null || v < 0) return setErro('Digite o saldo bruto que aparece no extrato.');
    try {
      await registrarExtrato(p.ativo.id, data, v / 100);
      aoSalvar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  }
  return (
    <form className="pilha" onSubmit={salvar}>
      <p className="corpo-pequeno suave" style={{ margin: 0 }}>
        Hoje o app estima {formatarMoeda(p.valorBruto)} ({DESCRICAO_METODO[p.metodo].toLowerCase()}). Copie o saldo bruto do app do banco para deixar exato; daqui em diante o app corrige pela taxa.
      </p>
      <AvisoErro>{erro}</AvisoErro>
      <Campo rotulo="Saldo bruto no extrato (R$)" numerico value={valor} onChange={(e) => setValor(e.target.value)} />
      <Campo rotulo="Data do extrato" type="date" value={data} max={hojeSP()} onChange={(e) => setData(e.target.value)} />
      <button className="botao botao-principal botao-largo">Salvar saldo</button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Registrar compra ou venda                                           */
/* ------------------------------------------------------------------ */

const NOVO = '__novo__';

function FormMovimentacao({ d, aoSalvar }: { d: DadosCarteira; aoSalvar: () => void }) {
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
    if (!ativoId) return setErro('Escolha o investimento.');
    if (ativoId === NOVO && !novo.nome.trim()) return setErro('Dê um nome, por exemplo "CDB Banco X 2028".');
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
    <form className="pilha" onSubmit={salvar}>
      <AvisoErro>{erro}</AvisoErro>
      <div className="seletor" role="radiogroup" aria-label="Tipo" style={{ width: 'fit-content' }}>
        {(['compra', 'venda'] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => setTipo(t)}>
            {tipo === t && <span className="seletor-fundo" />}
            <span>{t === 'compra' ? 'Compra' : 'Venda ou resgate'}</span>
          </button>
        ))}
      </div>
      <Selecao rotulo="Investimento" value={ativoId} onChange={(e) => setAtivoId(e.target.value)}>
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
          <Selecao rotulo="Para que serve" value={novo.classe} onChange={(e) => setNovo({ ...novo, classe: e.target.value as Classe })}>
            <option value="reserva">Reserva de emergência</option>
            <option value="renda_fixa">Renda fixa longa</option>
          </Selecao>
          <Selecao rotulo="Tipo" value={novo.tipo} onChange={(e) => { const t = e.target.value as TipoAtivo; setNovo({ ...novo, tipo: t, isento: t === 'lci_lca' }); }}>
            <option value="cdb">CDB</option>
            <option value="lci_lca">LCI / LCA (sem IR)</option>
            <option value="outro">Outro</option>
          </Selecao>
          <Selecao rotulo="Como rende" value={novo.indexador} onChange={(e) => setNovo({ ...novo, indexador: e.target.value as Indexador })}>
            <option value="cdi">% do CDI</option>
            <option value="pre">Prefixado</option>
            <option value="ipca">IPCA + taxa</option>
            <option value="nenhum">Não sei (atualizo pelo extrato)</option>
          </Selecao>
          <Campo rotulo="Vencimento" type="date" value={novo.vencimento} onChange={(e) => setNovo({ ...novo, vencimento: e.target.value })} />
          <label className="corpo-pequeno" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 40 }}>
            <input type="checkbox" checked={novo.liquidez} onChange={(e) => setNovo({ ...novo, liquidez: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--verde)' }} />
            Posso resgatar a qualquer dia
          </label>
        </div>
      )}

      <Campo rotulo="Data" type="date" value={data} max={hojeSP()} onChange={(e) => setData(e.target.value)} />
      {!unitario && <Campo rotulo={ativo?.tipo === 'etf' ? 'Cotas' : 'Quantidade'} numerico value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />}
      <Campo rotulo={unitario ? 'Valor (R$)' : 'Preço por unidade (R$)'} numerico value={preco} onChange={(e) => setPreco(e.target.value)} />
      {pedeTaxa && (
        <Campo rotulo={indexador === 'cdi' || indexador === 'selic' ? '% do índice' : 'Taxa (% a.a.)'} numerico value={taxa} onChange={(e) => setTaxa(e.target.value)}
          ajuda={indexador === 'cdi' ? 'Ex.: 102 para 102% do CDI.' : indexador === 'ipca' ? 'Só a parte real, ex.: 6,5 para IPCA + 6,5%.' : undefined} />
      )}
      <button className="botao botao-principal botao-largo" disabled={salvando}>{salvando ? 'Salvando…' : 'Registrar'}</button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

export default function Carteira() {
  const { sessao } = useSessao();
  const r = useCarregar(sessao ? `carteira:${sessao.user.id}` : null, carregarCarteira);
  const [registrando, setRegistrando] = useState(false);
  const [extrato, setExtrato] = useState<Posicao | null>(null);
  const [doMes, setDoMes] = useState<number | null>(null);
  const evolucao = useEvolucao(r.dados);
  const referencias = useReferencias(r.dados, evolucao);
  const resumo = r.dados ? resumoDaCarteira(r.dados) : null;

  useEffect(() => {
    if (r.dados && resumo && !r.doCacheDe) rendimentoDoMes(r.dados, resumo.total).then(setDoMes).catch(() => setDoMes(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.dados]);

  const acoes = (
    <>
      {r.dados && (
        <button className="botao botao-secundario" onClick={() => {
          const url = URL.createObjectURL(new Blob([movimentacoesEmCSV(r.dados!)], { type: 'text/csv;charset=utf-8' }));
          const a = Object.assign(document.createElement('a'), { href: url, download: `investindo-movimentacoes-${hojeSP()}.csv` });
          a.click();
          URL.revokeObjectURL(url);
        }}>
          <Download size={18} aria-hidden /> <span className="so-notebook">Exportar</span>
        </button>
      )}
      <Link to="/impostos" className="botao botao-secundario" title="Imposto de Renda"><Landmark size={18} aria-hidden /> <span className="so-notebook">Imposto de Renda</span></Link>
      <button className="botao botao-principal" onClick={() => setRegistrando(true)}><Plus size={18} aria-hidden /> Registrar</button>
    </>
  );

  if (r.carregando && !r.dados) {
    return <><CabecalhoPagina titulo="Carteira" /><div className="esqueleto" style={{ height: 96 }} /><div className="grade"><div className="esqueleto n-8" style={{ height: 300 }} /><div className="esqueleto n-4" style={{ height: 300 }} /></div></>;
  }
  if (!r.dados || !resumo) return <><CabecalhoPagina titulo="Carteira" /><ErroCarga mensagem={r.erro ?? ''} tentarDeNovo={r.recarregar} /></>;

  const d = r.dados;
  const rendimento = resumo.total - resumo.totalAplicado;
  const recarregar = () => { setRegistrando(false); setExtrato(null); r.recarregar(); };
  const posicoes = [...resumo.posicoes].sort((a, b) => b.valorBruto - a.valorBruto);

  return (
    <>
      <CabecalhoPagina contexto={`${posicoes.length} investimentos`} titulo="Carteira" acoes={acoes} />
      <AvisoCache salvoEm={r.doCacheDe} />

      {posicoes.length === 0 ? (
        <section className="painel" style={{ textAlign: 'center', padding: 48 }}>
          <h2 className="subtitulo">Sua carteira está vazia</h2>
          <p className="suave" style={{ margin: 0 }}>Faça o primeiro aporte ou registre o que você já tem.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/investir" className="botao botao-principal">Fazer o primeiro aporte</Link>
            <button className="botao botao-secundario" onClick={() => setRegistrando(true)}>Registrar o que já tenho</button>
          </div>
        </section>
      ) : (
        <>
          <div className="faixa-resumo">
            <div><span>Patrimônio</span><b>{formatarMoeda(resumo.total)}</b></div>
            <div><span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>Aplicado <Dica sobre="aplicado" texto={GLOSSARIO.aplicado} /></span><b>{formatarMoeda(resumo.totalAplicado)}</b></div>
            <div><span>Resultado total</span><b className={rendimento >= 0 ? 'alta' : 'queda'}>{rendimento >= 0 ? '+' : '−'}{formatarMoeda(Math.abs(rendimento))}</b></div>
            <div><span>Neste mês</span><b className={doMes === null ? 'neutra' : doMes >= 0 ? 'alta' : 'queda'}>{doMes === null ? '—' : `${doMes >= 0 ? '+' : '−'}${formatarMoeda(Math.abs(doMes))}`}</b></div>
          </div>

          <div className="grade">
            <section className="painel n-8">
              <div className="painel-titulo">
                <h2>Evolução</h2>
                <span className="nota">
                  <i className="traco-legenda" style={{ background: 'var(--verde)', marginLeft: 0 }} />Sua carteira
                  <i className="traco-legenda" style={{ background: 'var(--tinta-suave)' }} />Aplicado
                  {referencias?.cdi.length ? <><i className="traco-legenda" style={{ background: 'var(--ouro)' }} />CDI</> : null}
                  {referencias?.ibov.length ? <><i className="traco-legenda" style={{ background: 'var(--tinta)' }} />Ibovespa</> : null}
                </span>
              </div>
              {evolucao === null && <div className="esqueleto" style={{ height: 260 }} />}
              {evolucao && evolucao.length >= 2 && (
                <GraficoEvolucao pontos={evolucao} altura={260} referencias={[
                  ...(referencias?.cdi.length ? [{ nome: 'CDI', token: 'ouro' as const, pontos: referencias.cdi }] : []),
                  ...(referencias?.ibov.length ? [{ nome: 'Ibovespa', token: 'tinta' as const, pontos: referencias.ibov }] : []),
                ]} />
              )}
              {evolucao && evolucao.length < 2 && <p className="corpo-pequeno suave">O gráfico aparece a partir do segundo dia com investimentos.</p>}
              {referencias?.resumo && (
                <div className="comparativo" aria-label="Comparação com o mesmo dinheiro em outros lugares">
                  <div><span>Sua carteira</span><b className={referencias.resumo.carteira >= 0 ? 'alta' : 'queda'}>{sinalPct(referencias.resumo.carteira)}</b></div>
                  <div><span>Tudo no CDI</span><b>{sinalPct(referencias.resumo.cdi)}</b></div>
                  <div><span>Tudo no Ibovespa</span><b>{referencias.resumo.ibov === null ? '—' : sinalPct(referencias.resumo.ibov)}</b></div>
                </div>
              )}
              {referencias?.resumo && (
                <p className="nota">
                  Mesmos aportes, nas mesmas datas, como se tivessem ido todos para o CDI (renda fixa) ou todos para o Ibovespa (bolsa).
                  Uma carteira diversificada fica no meio do caminho de propósito: rende menos que a bolsa nos anos bons e cai menos nos ruins.
                </p>
              )}
            </section>

            <section className="painel n-4">
              <div className="painel-titulo"><h2>Alocação</h2></div>
              <BarraAlocacao partes={resumo.classes.map((c) => ({ rotulo: NOME_CLASSE[c.classe], valor: c.valorBruto, cor: COR_CLASSE[c.classe] }))} />
              <ul className="linhas" style={{ marginTop: 8 }}>
                {resumo.classes.filter((c) => c.percentualAlvo !== null).map((c) => {
                  const diff = c.percentualAtual - (c.percentualAlvo ?? 0);
                  return (
                    <li key={c.classe} style={{ gridTemplateColumns: '1fr auto' }}>
                      <span><span className="marca-classe" style={{ background: COR_CLASSE[c.classe] }} />{NOME_CLASSE[c.classe]}</span>
                      <span className="valor-pequeno" style={{ textAlign: 'right' }}>
                        {formatarPercentual(c.percentualAtual, 0)} <span className="suave">/ {formatarPercentual(c.percentualAlvo ?? 0, 0)}</span>
                        {Math.abs(diff) > 5 && <small style={{ display: 'block' }} className={diff < 0 ? 'queda' : 'suave'}>{diff < 0 ? 'abaixo do alvo' : 'acima do alvo'}</small>}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="nota">Atual / alvo, sem contar a reserva. O próximo aporte prioriza o que estiver abaixo.</p>
            </section>
          </div>

          <section className="painel">
            <div className="painel-titulo"><h2>Aportes por mês</h2><span className="nota">últimos 12 meses</span></div>
            <GraficoAportes
              formatar={formatarMoeda}
              meses={aportesPorMes(d.movimentacoes, d.ativos, d.hoje).map((m) => ({
                rotulo: nomeMes(m.mes, 'short'),
                rotuloLongo: nomeMes(m.mes, 'long'),
                partes: TODAS_CLASSES.map((c) => ({ rotulo: NOME_CLASSE[c], valor: m.porClasse[c], cor: COR_CLASSE[c] })),
              }))}
            />
            <div className="legenda-alocacao" aria-hidden>
              {TODAS_CLASSES.map((c) => <span key={c}><i style={{ background: COR_CLASSE[c] }} />{NOME_CLASSE[c]}</span>)}
            </div>
          </section>

          <section className="painel">
            <div className="painel-titulo"><h2>Investimentos</h2></div>
            <table className="posicoes">
              <thead>
                <tr><th>Investimento</th><th className="num">Aplicado</th><th className="num">Valor hoje</th><th className="num">Resultado</th><th>Avaliado por</th><th aria-label="Ações" /></tr>
              </thead>
              <tbody>
                {posicoes.map((p) => (
                  <tr key={p.ativo.id}>
                    <td>
                      <div className="ativo-celula">
                        <b><span className="marca-classe" style={{ background: COR_CLASSE[p.ativo.classe] }} />{p.ativo.nome}</b>
                        <small>{NOME_CLASSE[p.ativo.classe]}{p.ativo.tipo === 'etf' && ` · ${p.quantidade.toLocaleString('pt-BR')} ${p.quantidade === 1 ? 'cota' : 'cotas'}`}</small>
                      </div>
                    </td>
                    <td className="num" data-movel="oculto">{formatarMoeda(p.aplicado)}</td>
                    <td className="num"><b>{formatarMoeda(p.valorBruto)}</b></td>
                    <td className="num" data-movel="oculto"><Resultado valor={p.valorBruto - p.aplicado} base={p.aplicado} /></td>
                    <td data-movel="linha">
                      <small className="suave">{DESCRICAO_METODO[p.metodo]} · {formatarData(p.dataReferencia)}</small>
                      {p.irEstimado > 0 && <small className="suave" style={{ display: 'block' }}>IR se resgatar hoje: {formatarMoeda(p.irEstimado)}</small>}
                    </td>
                    <td data-movel="linha" style={{ textAlign: 'right' }}>
                      {p.ativo.tipo !== 'etf' && (
                        <button className="link-discreto" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }} onClick={() => setExtrato(p)}>
                          <Receipt size={15} aria-hidden /> Extrato
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="nota">Valores brutos, antes do IR. ETFs pela cotação do dia; Tesouro pelo preço de resgate; CDB pela taxa contratada ou pelo extrato.</p>
          </section>
        </>
      )}

      <Folha aberta={registrando} titulo="Registrar compra ou venda" aoFechar={() => setRegistrando(false)}>
        <FormMovimentacao d={d} aoSalvar={recarregar} />
      </Folha>
      <Folha aberta={extrato !== null} titulo={extrato ? `Atualizar ${extrato.ativo.nome}` : ''} aoFechar={() => setExtrato(null)}>
        {extrato && <FormExtrato p={extrato} aoSalvar={recarregar} />}
      </Folha>
    </>
  );
}
