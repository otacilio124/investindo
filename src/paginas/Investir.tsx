import { CheckCircle2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AvisoCache, AvisoErro, Campo, Carregando, ErroCarga, Selecao } from '../componentes/base';
import { Cabecalho } from '../componentes/Estrutura';
import { ratear, type ResultadoRateio } from '../domain/rateio';
import { COR_CLASSE, NOME_CLASSE, centavos, type Classe } from '../domain/tipos';
import {
  ativoDoProduto,
  cancelarAporte,
  carregarAportePendente,
  carregarCarteira,
  confirmarAporte,
  montarContextoRateio,
  salvarAporteSugerido,
  useCarregar,
  type AportePendente,
  type CompraConfirmada,
  type DadosCarteira,
} from '../lib/dados';
import { formatarMoeda, formatarTaxa, hojeSP, lerMoeda } from '../lib/formato';
import { useSessao } from '../lib/sessao';

function ResultadoDoRateio({ r, escolhaRF }: { r: ResultadoRateio; escolhaRF: ReturnType<typeof montarContextoRateio>['escolhaRF'] }) {
  return (
    <section className="pilha">
      <h2 className="subtitulo">Seu aporte de {formatarMoeda(r.disponivel)} fica assim</h2>
      {r.itens.length === 0 && <p>Nada a comprar este mês.</p>}
      {r.itens.map((i) => (
        <article key={`${i.classe}-${i.produto}`} className="cartao pilha-curta" style={{ borderLeftWidth: 1 }}>
          <div className="linha-entre">
            <span className="sobretitulo" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span aria-hidden style={{ width: 10, height: 10, background: COR_CLASSE[i.classe], display: 'inline-block' }} />
              {NOME_CLASSE[i.classe]}
            </span>
            <span className="valor-medio">{formatarMoeda(i.valor)}</span>
          </div>
          <p style={{ margin: 0, fontWeight: 600 }}>{i.produto}</p>
          {i.quantidade !== null && <p className="valor-pequeno" style={{ margin: 0 }}>{i.quantidade} {i.quantidade === 1 ? 'cota' : 'cotas'}</p>}
          <p className="corpo-pequeno suave" style={{ margin: 0 }}>{i.motivo}</p>
        </article>
      ))}
      {r.caixaPendenteNovo > 0 && (
        <div className="aviso aviso-info">{formatarMoeda(r.caixaPendenteNovo)} ficam guardados e somam ao aporte do mês que vem.</div>
      )}
      <details className="cartao">
        <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 600 }}>Como chegamos aqui</summary>
        <ol className="corpo-pequeno pilha-curta" style={{ paddingLeft: 20 }}>
          {r.passos.map((p) => <li key={p}>{p}</li>)}
          {escolhaRF && <li>{escolhaRF.motivo}</li>}
        </ol>
        {escolhaRF && escolhaRF.comparacao.length > 1 && (
          <table className="tabela corpo-pequeno">
            <thead><tr><th>Renda fixa comparada</th><th className="num">Líquido a.a.</th></tr></thead>
            <tbody>
              {escolhaRF.comparacao.map((c) => <tr key={c.produto}><td>{c.produto}</td><td className="num">{formatarTaxa(c.liquidoAnual)}</td></tr>)}
            </tbody>
          </table>
        )}
      </details>
    </section>
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
      aoTerminar('Aporte registrado. Carteira e metas atualizadas.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  }

  async function descartar() {
    setSalvando(true);
    await cancelarAporte(pendente.id).catch(() => undefined);
    aoTerminar('Sugestão descartada.');
  }

  return (
    <form className="pilha" onSubmit={confirmar}>
      <div className="pilha-curta">
        <h2 className="subtitulo">Depois de comprar no seu banco</h2>
        <p className="corpo-pequeno suave">Confira o que você comprou e ajuste o preço pago, se for diferente. Desmarque o que não comprou.</p>
      </div>
      <AvisoErro>{erro}</AvisoErro>
      <Campo rotulo="Data da compra" type="date" value={data} max={hojeSP()} onChange={(e) => setData(e.target.value)} />
      {linhas.map((l, k) => {
        const opcoes = d.ativos.filter((a) => a.classe === l.classe || (l.classe === 'renda_fixa' && a.tipo === 'tesouro' && a.classe !== 'reserva'));
        const ativo = d.ativos.find((a) => a.id === l.ativoId);
        const pedeTaxa = ativo && ativo.tipo !== 'etf' && ativo.indexador !== 'nenhum';
        return (
          <fieldset key={l.itemId} className="cartao pilha" style={{ margin: 0 }} disabled={salvando}>
            <legend className="visualmente-oculto">{l.produto}</legend>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, fontWeight: 600 }}>
              <input type="checkbox" checked={l.comprado} onChange={(e) => alterar(k, { comprado: e.target.checked })} style={{ width: 20, height: 20 }} />
              {NOME_CLASSE[l.classe]} · {l.produto}
            </label>
            {l.comprado && (
              <>
                <Selecao rotulo="Produto comprado" value={l.ativoId} onChange={(e) => alterar(k, { ativoId: e.target.value })}
                  ajuda={<>Não está na lista? <Link to="/carteira">Cadastre na Carteira</Link>.</>}>
                  <option value="">Escolha…</option>
                  {opcoes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </Selecao>
                <div className="grade-cartoes">
                  <Campo rotulo={ativo?.tipo === 'etf' ? 'Cotas' : ativo?.tipo === 'tesouro' ? 'Quantidade de títulos' : 'Quantidade'} numerico value={l.quantidade} onChange={(e) => alterar(k, { quantidade: e.target.value })} />
                  <Campo rotulo="Preço por unidade (R$)" numerico value={l.preco} onChange={(e) => alterar(k, { preco: e.target.value })} />
                  {pedeTaxa && (
                    <Campo rotulo={ativo.indexador === 'cdi' || ativo.indexador === 'selic' ? '% do índice' : 'Taxa contratada (% a.a.)'} numerico value={l.taxa} onChange={(e) => alterar(k, { taxa: e.target.value })} />
                  )}
                </div>
              </>
            )}
          </fieldset>
        );
      })}
      <button className="botao botao-principal botao-largo" disabled={salvando}>
        <CheckCircle2 size={20} className="icone" aria-hidden /> {salvando ? 'Salvando…' : 'Marquei como comprado'}
      </button>
      <button type="button" className="botao-link" onClick={descartar} disabled={salvando}>Descartar esta sugestão</button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

export default function Investir() {
  const { sessao } = useSessao();
  const carteira = useCarregar(sessao ? `carteira:${sessao.user.id}` : null, carregarCarteira);
  const pendenteR = useCarregar(null, carregarAportePendente);
  const [valor, setValor] = useState('');
  const [resultado, setResultado] = useState<{ aporte: number; r: ResultadoRateio } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const ctx = useMemo(() => (carteira.dados ? montarContextoRateio(carteira.dados) : null), [carteira.dados]);

  if ((carteira.carregando && !carteira.dados) || pendenteR.carregando) return <><Cabecalho sobretitulo="Aporte do mês" /><main className="pagina"><Carregando /></main></>;
  if (!carteira.dados || !ctx) return <><Cabecalho sobretitulo="Aporte do mês" /><main className="pagina"><ErroCarga mensagem={carteira.erro ?? ''} tentarDeNovo={carteira.recarregar} /></main></>;
  const d = carteira.dados;

  function calcular(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setMensagem(null);
    const aporte = lerMoeda(valor);
    if (aporte === null || aporte <= 0) return setErro('Digite quanto quer investir, por exemplo 700,00.');
    if (aporte > centavos(10_000_000)) return setErro('Valor alto demais para este app.');
    try {
      setResultado({ aporte, r: ratear({ ...ctx!.entrada, aporte }) });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível calcular.');
    }
  }

  async function salvar() {
    if (!resultado) return;
    setSalvando(true);
    try {
      await salvarAporteSugerido(d, resultado.aporte, resultado.r, ctx!);
      setResultado(null);
      setValor('');
      pendenteR.recarregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  const pendente = pendenteR.dados;

  return (
    <>
      <Cabecalho sobretitulo="Aporte do mês" />
      <main className="pagina">
        <AvisoCache salvoEm={carteira.doCacheDe} />
        {mensagem && <div className="aviso aviso-conquista" role="status">{mensagem}</div>}

        {pendente ? (
          <ConfirmarCompras
            d={d}
            pendente={pendente}
            aoTerminar={(msg) => { setMensagem(msg); pendenteR.recarregar(); carteira.recarregar(); }}
          />
        ) : (
          <>
            <form className="pilha" onSubmit={calcular} noValidate>
              <Campo rotulo="Quanto você vai investir este mês? (R$)" numerico value={valor} placeholder="700,00"
                onChange={(e) => { setValor(e.target.value); setResultado(null); }} erro={erro} />
              <button className="botao botao-principal botao-largo">Calcular rateio</button>
            </form>
            {ctx.avisos.length > 0 && (
              <ul className="legenda pilha-curta" style={{ margin: 0, paddingLeft: 16 }}>
                {ctx.avisos.map((a) => <li key={a}>{a}</li>)}
              </ul>
            )}
            {resultado && (
              <>
                <ResultadoDoRateio r={resultado.r} escolhaRF={ctx.escolhaRF} />
                <button className="botao botao-principal botao-largo" onClick={salvar} disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Vou comprar assim'}
                </button>
                <p className="legenda">O Investindo! aplica as regras que você definiu. Não é recomendação de investimento.</p>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
