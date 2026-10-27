import { ArrowRight, CheckCircle2, ExternalLink } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AvisoCache, AvisoErro, Campo, ErroCarga, Selecao } from '../componentes/base';
import { CabecalhoPagina } from '../componentes/Estrutura';
import { Dica, GLOSSARIO } from '../componentes/ui';
import { ratear, type ResultadoRateio } from '../domain/rateio';
import { COR_CLASSE, NOME_CLASSE, type Classe } from '../domain/tipos';
import {
  ativoDoProduto,
  cancelarAporte,
  carregarAportePendente,
  carregarCarteira,
  confirmarAporte,
  montarContextoRateio,
  salvarAporteSugerido,
  ultimoValorAportado,
  useCarregar,
  type AportePendente,
  type CompraConfirmada,
  type DadosCarteira,
} from '../lib/dados';
import { formatarMoeda, formatarTaxa, hojeSP, lerMoeda } from '../lib/formato';
import { useSessao } from '../lib/sessao';

type Etapa = 'valor' | 'plano' | 'comprar' | 'confirmar';
const ETAPAS: { id: Etapa; rotulo: string }[] = [
  { id: 'valor', rotulo: 'Valor' },
  { id: 'plano', rotulo: 'Plano' },
  { id: 'comprar', rotulo: 'Comprar no banco' },
  { id: 'confirmar', rotulo: 'Confirmar' },
];

function Etapas({ atual }: { atual: Etapa }) {
  const i = ETAPAS.findIndex((e) => e.id === atual);
  return (
    <ol className="etapas" aria-label="Etapas do aporte">
      {ETAPAS.map((e, k) => (
        <li key={e.id} data-estado={k < i ? 'feito' : k === i ? 'atual' : 'futuro'} aria-current={k === i ? 'step' : undefined}>
          {e.rotulo}
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */

function Plano({ r, escolhaRF }: { r: ResultadoRateio; escolhaRF: ReturnType<typeof montarContextoRateio>['escolhaRF'] }) {
  return (
    <div className="pilha">
      {r.itens.length === 0 && <p className="suave" style={{ margin: 0 }}>Nada a comprar com esse valor. Ele fica guardado para o próximo mês.</p>}
      <ul className="plano">
        {r.itens.map((i) => (
          <li key={`${i.classe}-${i.produto}`}>
            <span className="faixa-cor" style={{ background: COR_CLASSE[i.classe] }} aria-hidden />
            <div>
              <b>{i.produto}{i.quantidade !== null && <span className="suave" style={{ fontWeight: 400 }}> · {i.quantidade} {i.quantidade === 1 ? 'cota' : 'cotas'}</span>}</b>
              <small>{NOME_CLASSE[i.classe]} — {i.motivo}</small>
            </div>
            <span className="valor-pequeno">{formatarMoeda(i.valor)}</span>
          </li>
        ))}
      </ul>
      {r.caixaPendenteNovo > 0 && (
        <p className="nota">{formatarMoeda(r.caixaPendenteNovo)} ficam guardados e entram no aporte do mês que vem.</p>
      )}
      <details>
        <summary className="link-discreto" style={{ cursor: 'pointer', minHeight: 36 }}>Por que essa divisão?</summary>
        <ol className="corpo-pequeno pilha-curta" style={{ paddingLeft: 20, margin: '8px 0 0' }}>
          {r.passos.map((p) => <li key={p}>{p}</li>)}
          {escolhaRF && <li>{escolhaRF.motivo}</li>}
        </ol>
        {escolhaRF && escolhaRF.comparacao.length > 1 && (
          <table className="tabela corpo-pequeno" style={{ marginTop: 12 }}>
            <thead><tr><th>Renda fixa comparada</th><th className="num">Líquido a.a.</th></tr></thead>
            <tbody>{escolhaRF.comparacao.map((c) => <tr key={c.produto}><td>{c.produto}</td><td className="num">{formatarTaxa(c.liquidoAnual)}</td></tr>)}</tbody>
          </table>
        )}
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface LinhaConfirmacao {
  itemId: string;
  classe: Classe;
  produto: string;
  ativoId: string;
  quantidade: string;
  preco: string;
  taxa: string;
  comprado: boolean;
}

function linhaInicial(d: DadosCarteira, i: AportePendente['itens'][number]): LinhaConfirmacao {
  const ativo = (i.ativo_id && d.ativos.find((a) => a.id === i.ativo_id)) || ativoDoProduto(d, i.classe, i.produto);
  const preco = ativo ? d.precos[ativo.codigo] : undefined;
  const br = (v: number, casas = 2) => v.toFixed(casas).replace('.', ',');
  let quantidade = '1';
  let precoUnit = br(Number(i.valor_sugerido));
  let taxa = '';
  if (ativo?.tipo === 'etf') {
    quantidade = String(i.quantidade_sugerida ?? 0);
    precoUnit = br(Number(i.preco_referencia ?? (preco ? preco.preco / 100 : 0)));
  } else if (ativo?.tipo === 'tesouro') {
    const pu = preco?.precoCompra ?? preco?.preco;
    if (pu) {
      // 4 casas: registra o valor aplicado com fidelidade; a pessoa confere no comprovante.
      quantidade = br(Math.round((Number(i.valor_sugerido) / (pu / 100)) * 10000) / 10000, 4);
      precoUnit = br(pu / 100);
    }
    if (preco?.taxaCompra != null && ativo.indexador !== 'selic') taxa = br(preco.taxaCompra);
  } else if (ativo?.indexador === 'pre' && d.perfil.cdb_pre_taxa) {
    taxa = br(Number(d.perfil.cdb_pre_taxa));
  } else if (ativo?.indexador === 'cdi') {
    taxa = '100';
  }
  return { itemId: i.id, classe: i.classe, produto: i.produto, ativoId: ativo?.id ?? '', quantidade, preco: precoUnit, taxa, comprado: true };
}

const numeroBR = (s: string) => {
  const n = Number(s.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

function ConfirmarCompras({ d, pendente, aoTerminar }: { d: DadosCarteira; pendente: AportePendente; aoTerminar: (msg: string) => void }) {
  const [linhas, setLinhas] = useState(() => pendente.itens.map((i) => linhaInicial(d, i)));
  const [data, setData] = useState(hojeSP());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const alterar = (k: number, campo: Partial<LinhaConfirmacao>) => setLinhas(linhas.map((l, i) => (i === k ? { ...l, ...campo } : l)));

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (data > hojeSP()) return setErro('A data da compra não pode estar no futuro.');
    const compras: CompraConfirmada[] = [];
    for (const l of linhas.filter((x) => x.comprado)) {
      const q = numeroBR(l.quantidade);
      const p = numeroBR(l.preco);
      if (!l.ativoId) return setErro(`Escolha o produto comprado em ${NOME_CLASSE[l.classe]}.`);
      if (!(q > 0) || !(p >= 0)) return setErro(`Confira quantidade e preço de ${l.produto}.`);
      compras.push({ ativo_id: l.ativoId, data, quantidade: q, preco_unitario: p, taxa_contratada: l.taxa.trim() ? numeroBR(l.taxa) : null });
    }
    setSalvando(true);
    try {
      await confirmarAporte(pendente.id, compras);
      aoTerminar('Pronto! Aporte registrado e carteira atualizada.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  }

  async function descartar() {
    setSalvando(true);
    await cancelarAporte(pendente.id).catch(() => undefined);
    aoTerminar('Plano descartado. Você pode calcular de novo quando quiser.');
  }

  return (
    <div className="grade">
      <aside className="painel n-4 t-12">
        <div className="painel-titulo"><h2>O que comprar</h2></div>
        <ul className="plano">
          {pendente.itens.map((i) => (
            <li key={i.id}>
              <span className="faixa-cor" style={{ background: COR_CLASSE[i.classe] }} aria-hidden />
              <div><b>{i.produto}</b><small>{i.quantidade_sugerida ? `${Number(i.quantidade_sugerida)} cotas` : NOME_CLASSE[i.classe]}</small></div>
              <span className="valor-pequeno">{formatarMoeda(Math.round(Number(i.valor_sugerido) * 100))}</span>
            </li>
          ))}
        </ul>
        <p className="nota" style={{ display: 'flex', gap: 6 }}>
          <ExternalLink size={14} aria-hidden style={{ flex: 'none', marginTop: 1 }} />
          Abra o app do seu banco ou corretora, compre cada item e volte aqui para confirmar.
        </p>
      </aside>

      <form className="painel n-8 t-12" onSubmit={confirmar}>
        <div className="painel-titulo"><h2>Confirme o que você comprou</h2></div>
        <p className="corpo-pequeno suave" style={{ margin: 0 }}>Ajuste o preço se pagou diferente. Desmarque o que não comprou.</p>
        <AvisoErro>{erro}</AvisoErro>
        <div style={{ maxWidth: 220 }}>
          <Campo rotulo="Data da compra" type="date" value={data} max={hojeSP()} onChange={(e) => setData(e.target.value)} />
        </div>
        {linhas.map((l, k) => {
          const opcoes = d.ativos.filter((a) => a.classe === l.classe || (l.classe === 'renda_fixa' && a.tipo === 'tesouro' && a.classe !== 'reserva'));
          const ativo = d.ativos.find((a) => a.id === l.ativoId);
          const pedeTaxa = ativo && ativo.tipo !== 'etf' && ativo.indexador !== 'nenhum';
          return (
            <fieldset key={l.itemId} className="pilha" disabled={salvando}
              style={{ margin: 0, padding: '16px 0 0', border: 0, borderTop: '1px solid var(--linha)' }}>
              <legend className="visualmente-oculto">{l.produto}</legend>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 40, fontWeight: 600 }}>
                <input type="checkbox" checked={l.comprado} onChange={(e) => alterar(k, { comprado: e.target.checked })} style={{ width: 20, height: 20, accentColor: 'var(--verde)' }} />
                {l.produto} <span className="suave" style={{ fontWeight: 400 }}>· {NOME_CLASSE[l.classe]}</span>
              </label>
              {l.comprado && (
                <div className="grade" style={{ gap: 12 }}>
                  <div className={pedeTaxa ? 'n-5 t-12' : 'n-6 t-12'}>
                    <Selecao rotulo="Produto" value={l.ativoId} onChange={(e) => alterar(k, { ativoId: e.target.value })}
                      ajuda={<>Não achou? <Link to="/carteira">Cadastre na Carteira</Link>.</>}>
                      <option value="">Escolha…</option>
                      {opcoes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                    </Selecao>
                  </div>
                  <div className={pedeTaxa ? 'n-2 t-6' : 'n-3 t-6'}>
                    <Campo rotulo={ativo?.tipo === 'etf' ? 'Cotas' : 'Quantidade'} numerico value={l.quantidade} onChange={(e) => alterar(k, { quantidade: e.target.value })} />
                  </div>
                  <div className="n-3 t-6">
                    <Campo rotulo="Preço (R$)" numerico value={l.preco} onChange={(e) => alterar(k, { preco: e.target.value })} />
                  </div>
                  {pedeTaxa && (
                    <div className="n-2 t-6">
                      <Campo rotulo={ativo.indexador === 'cdi' || ativo.indexador === 'selic' ? '% do índice' : 'Taxa % a.a.'} numerico value={l.taxa} onChange={(e) => alterar(k, { taxa: e.target.value })} />
                    </div>
                  )}
                </div>
              )}
            </fieldset>
          );
        })}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', borderTop: '1px solid var(--linha)', paddingTop: 16 }}>
          <button className="botao botao-principal" disabled={salvando}>
            <CheckCircle2 size={18} aria-hidden /> {salvando ? 'Salvando…' : 'Confirmar compras'}
          </button>
          <button type="button" className="botao-link" onClick={descartar} disabled={salvando}>Descartar e recalcular</button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function Investir() {
  const { sessao } = useSessao();
  const carteira = useCarregar(sessao ? `carteira:${sessao.user.id}` : null, carregarCarteira);
  const pendenteR = useCarregar(null, carregarAportePendente);
  const ultimo = useCarregar(null, ultimoValorAportado);
  const [valor, setValor] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const ctx = useMemo(() => (carteira.dados ? montarContextoRateio(carteira.dados) : null), [carteira.dados]);
  const aporte = lerMoeda(valor);
  // Prévia ao vivo: o plano se refaz a cada número digitado.
  const previa = useMemo(() => {
    if (!ctx || aporte === null || aporte <= 0 || aporte > 1_000_000_000) return null;
    try {
      return ratear({ ...ctx.entrada, aporte });
    } catch {
      return null;
    }
  }, [ctx, aporte]);

  const cab = (etapa: Etapa) => (
    <>
      <CabecalhoPagina contexto="Aporte do mês" titulo="Investir" />
      <Etapas atual={etapa} />
    </>
  );

  if ((carteira.carregando && !carteira.dados) || pendenteR.carregando) {
    return <>{cab('valor')}<div className="grade"><div className="esqueleto n-5" style={{ height: 260 }} /><div className="esqueleto n-7" style={{ height: 260 }} /></div></>;
  }
  if (!carteira.dados || !ctx) return <>{cab('valor')}<ErroCarga mensagem={carteira.erro ?? ''} tentarDeNovo={carteira.recarregar} /></>;
  const d = carteira.dados;
  const pendente = pendenteR.dados;

  if (pendente) {
    return (
      <>
        {cab('confirmar')}
        <ConfirmarCompras d={d} pendente={pendente}
          aoTerminar={(msg) => { setMensagem(msg); pendenteR.recarregar(); carteira.recarregar(); }} />
      </>
    );
  }

  async function seguir(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!previa || aporte === null) return setErro('Digite quanto quer investir, por exemplo 700.');
    setSalvando(true);
    try {
      await salvarAporteSugerido(d, aporte, previa, ctx!);
      setValor('');
      pendenteR.recarregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  const atalhos = [...new Set([ultimo.dados, 50000, 70000, 100000].filter((v): v is number => !!v))];
  const faltaReserva = Math.max(0, ctx.entrada.reserva.meta - ctx.entrada.reserva.saldo);

  return (
    <>
      {cab(previa ? 'plano' : 'valor')}
      {mensagem && <div className="aviso aviso-conquista" role="status">{mensagem}</div>}
      <AvisoCache salvoEm={carteira.doCacheDe} />

      <div className="grade">
        <form className="painel n-5" onSubmit={seguir} noValidate>
          <div className="painel-titulo"><h2>Quanto você vai investir?</h2></div>
          <label className="visualmente-oculto" htmlFor="valor-aporte">Valor do aporte em reais</label>
          <div className="campo-valor">
            <span aria-hidden>R$</span>
            <input id="valor-aporte" inputMode="decimal" autoComplete="off" placeholder="0,00" value={valor} autoFocus
              onChange={(e) => { setValor(e.target.value); setErro(null); }} aria-invalid={Boolean(erro)} />
          </div>
          <div className="valores-rapidos" aria-label="Valores rápidos">
            {atalhos.map((v) => {
              const texto = (v / 100).toLocaleString('pt-BR', { minimumFractionDigits: v % 100 ? 2 : 0 });
              return (
                <button key={v} type="button" aria-pressed={aporte === v} onClick={() => setValor(texto)}>
                  {v === ultimo.dados ? `Último: ${formatarMoeda(v)}` : formatarMoeda(v).replace(',00', '')}
                </button>
              );
            })}
          </div>
          <AvisoErro>{erro}</AvisoErro>
          <ul className="atencao corpo-pequeno suave">
            <li><span aria-hidden>·</span><span>{faltaReserva > 0 ? <>Faltam {formatarMoeda(faltaReserva)} na reserva; eles vêm primeiro.</> : 'Sua reserva está completa.'} <Dica sobre="rateio" texto={GLOSSARIO.rateio} /></span></li>
            {ctx.entrada.caixaPendente > 0 && <li><span aria-hidden>·</span><span>{formatarMoeda(ctx.entrada.caixaPendente)} guardados do mês passado entram junto.</span></li>}
            {ctx.avisos.map((a) => <li key={a}><span aria-hidden>·</span><span>{a}</span></li>)}
          </ul>
          <button className="botao botao-principal botao-largo" disabled={salvando || !previa}>
            {salvando ? 'Salvando…' : <>Vou comprar assim <ArrowRight size={18} aria-hidden /></>}
          </button>
          <p className="nota">O app aplica as regras que você definiu em Ajustes. Não é recomendação de investimento.</p>
        </form>

        <section className="painel n-7" aria-live="polite">
          <div className="painel-titulo">
            <h2>{previa ? `Plano para ${formatarMoeda(previa.disponivel)}` : 'Seu plano aparece aqui'}</h2>
          </div>
          {previa
            ? <Plano r={previa} escolhaRF={ctx.escolhaRF} />
            : <p className="corpo-pequeno suave" style={{ margin: 0 }}>Digite um valor ao lado. O app mostra na hora quanto vai para cada investimento e por quê.</p>}
        </section>
      </div>
    </>
  );
}
