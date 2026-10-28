import { motion } from 'framer-motion';
import { CandlestickChart, LineChart, Star } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ErroCarga } from '../componentes/base';
import { CabecalhoPagina } from '../componentes/Estrutura';
import { GraficoCandles, PERIODOS, recortar, type LegendaOHLC, type Periodo } from '../componentes/graficos';
import { formatarCompacto, ListaNoticias, LogoAtivo, PilulaVariacao } from '../componentes/mercado';
import { Sparkline } from '../componentes/minigraficos';
import { carregarPerfil, useCarregar } from '../lib/dados';
import { formatarData, formatarPercentual, hojeSP } from '../lib/formato';
import {
  alternarNaLista, carregarCandles, carregarDoCatalogo, carregarMinhaLista, carregarNoticias, carregarResumoCatalogo,
  casasDe, descricaoAtivo, formatarPreco, listarAtivos, NOME_TIPO, PAINEL_MERCADO, paraAtivoMercado, unidadeDe,
  type AtivoCatalogo, type AtivoMercado, type FiltroMercado, type MinhaLista,
} from '../lib/mercado';

function Seletor<T extends string>({ opcoes, valor, aoMudar, nome, rotulo }: {
  opcoes: { valor: T; rotulo: React.ReactNode; titulo?: string }[]; valor: T; aoMudar: (v: T) => void; nome: string; rotulo: string;
}) {
  return (
    <div className="seletor" role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={valor === o.valor} title={o.titulo} aria-label={o.titulo} onClick={() => aoMudar(o.valor)}>
          {valor === o.valor && <motion.span layoutId={`seletor-${nome}`} className="seletor-fundo" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
          <span>{o.rotulo}</span>
        </button>
      ))}
    </div>
  );
}

const ABAS: { id: string; rotulo: string; filtro: FiltroMercado }[] = [
  { id: 'altas', rotulo: 'Maiores altas', filtro: { tipo: 'altas' } },
  { id: 'baixas', rotulo: 'Maiores baixas', filtro: { tipo: 'baixas' } },
  { id: 'negociadas', rotulo: 'Mais negociadas', filtro: { tipo: 'negociadas' } },
  { id: 'acoes', rotulo: 'Ações', filtro: { tipo: 'tipos', tipos: ['acao'] } },
  { id: 'fiis', rotulo: 'FIIs', filtro: { tipo: 'tipos', tipos: ['fii'] } },
  { id: 'etfs', rotulo: 'ETFs', filtro: { tipo: 'tipos', tipos: ['etf'] } },
  { id: 'bdrs', rotulo: 'BDRs', filtro: { tipo: 'tipos', tipos: ['bdr'] } },
  { id: 'indices', rotulo: 'Índices', filtro: { tipo: 'tipos', tipos: ['indice'] } },
  { id: 'eua', rotulo: 'EUA', filtro: { tipo: 'tipos', tipos: ['acao_exterior'] } },
  { id: 'cripto', rotulo: 'Cripto', filtro: { tipo: 'tipos', tipos: ['cripto'] } },
  { id: 'moedas', rotulo: 'Moedas e commodities', filtro: { tipo: 'tipos', tipos: ['moeda', 'commodity'] } },
];

export default function Mercado() {
  const local = useLocation();
  const [params, setParams] = useSearchParams();
  const detalheRef = useRef<HTMLElement>(null);

  const perfil = useCarregar(null, carregarPerfil);
  const etfs = useMemo(() => (perfil.dados ? [perfil.dados.etf_acoes_br, perfil.dados.etf_exterior] : []), [perfil.dados]);
  const [lista, setLista] = useState<MinhaLista | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  useEffect(() => {
    if (!perfil.dados && perfil.carregando) return;
    carregarMinhaLista(etfs).then(setLista).catch((e: Error) => setErroLista(e.message));
  }, [etfs, perfil.dados, perfil.carregando]);
  const codigosLista = useMemo(() => lista?.codigos ?? [], [lista]);
  const resumo = useCarregar(lista ? `mercado:lista:${codigosLista.join(',')}` : null, () => (lista ? carregarResumoCatalogo(codigosLista) : Promise.resolve([])), [codigosLista, lista]);

  const codigo = (params.get('ativo') ?? codigosLista[0] ?? 'IBOV').toUpperCase();
  const catalogo = useCarregar(`mercado:ativo:${codigo}`, () => carregarDoCatalogo([codigo]), [codigo]);
  const candles = useCarregar(`mercado:candles:${codigo}`, () => carregarCandles(codigo), [codigo]);
  const noticias = useCarregar('mercado:noticias', () => carregarNoticias(30));

  const [periodo, setPeriodo] = useState<Periodo>('6M');
  const [tipo, setTipo] = useState<'candles' | 'linha'>('candles');
  const [medias, setMedias] = useState(true);
  const [cursor, setCursor] = useState<LegendaOHLC | null>(null);
  const aoMoverCursor = useCallback((l: LegendaOHLC | null) => setCursor(l), []);

  useEffect(() => {
    if (local.hash === '#noticias') document.getElementById('noticias')?.scrollIntoView();
  }, [local.hash, noticias.dados]);
  useEffect(() => setCursor(null), [codigo]);

  const info: AtivoCatalogo | undefined = catalogo.dados?.[0];
  const ativo: AtivoMercado = info ? paraAtivoMercado(info)
    : resumo.dados?.find((a) => a.codigo === codigo) ?? PAINEL_MERCADO.find((a) => a.codigo === codigo)
    ?? { codigo, nome: codigo, tipo: 'acao', unidade: 'R$' };
  const naLista = codigosLista.includes(codigo);

  const todos = candles.dados ?? [];
  const visiveis = useMemo(() => recortar(candles.dados ?? [], periodo), [candles.dados, periodo]);
  const ultimo = todos[todos.length - 1];
  const anterior = todos[todos.length - 2];
  const legenda = cursor ?? (ultimo ? { candle: ultimo, variacao: anterior ? ((ultimo.fechamento - anterior.fechamento) / anterior.fechamento) * 100 : 0 } : null);
  // O catálogo é atualizado no meio do pregão; se ele for mais novo que o último candle, é o preço da vez.
  const catalogoMaisNovo = Boolean(info?.preco && (!ultimo || hojeSP(new Date(info.atualizado_em)) > ultimo.data));
  const varPeriodo = visiveis.length > 1 ? ((visiveis[visiveis.length - 1].fechamento - visiveis[0].abertura) / visiveis[0].abertura) * 100 : null;
  const ano = todos.slice(-252);
  const max52 = ano.length ? Math.max(...ano.map((c) => c.maxima)) : null;
  const min52 = ano.length ? Math.min(...ano.map((c) => c.minima)) : null;
  const casas = casasDe(ultimo?.fechamento ?? info?.preco ?? 0, ativo.unidade, ativo.tipo);
  const fmt = (v: number) => formatarPreco(v, ativo.unidade, ativo.tipo);

  function escolher(c: string) {
    setParams({ ativo: c }, { replace: true });
    if (window.innerWidth < 1200) detalheRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function alternar() {
    if (!lista) return;
    try {
      setLista(await alternarNaLista(codigo, lista));
      setErroLista(null);
    } catch (e) {
      setErroLista((e as Error).message);
    }
  }

  return (
    <>
      <CabecalhoPagina titulo="Mercado" contexto="B3, Estados Unidos, moedas e cripto · preços de fechamento diário" />

      <div className="mercado">
        {/* Minha lista */}
        <section className="painel mercado-lista" aria-label="Minha lista">
          <div className="painel-titulo">
            <h2>Minha lista</h2>
            <span className="nota">{codigosLista.length} ativos</span>
          </div>
          {!resumo.dados && <div className="esqueleto" style={{ height: 320 }} />}
          {resumo.dados && (
            <ul className="lista-acompanhando">
              {resumo.dados.map((a) => (
                <li key={a.codigo}>
                  <button type="button" className="linha-mercado" aria-pressed={a.codigo === codigo} onClick={() => escolher(a.codigo)}>
                    <LogoAtivo codigo={a.codigo} tipo={a.tipo} logo={a.logo} tamanho={34} />
                    <span className="linha-mercado-nome"><b>{a.codigo}</b><small>{descricaoAtivo(a)}</small></span>
                    <Sparkline valores={a.serie} largura={64} altura={26} area={false} />
                    <span className="preco">
                      <span className="valor-pequeno">{formatarPreco(a.ultimo, a.unidade, a.tipo)}</span>
                      <PilulaVariacao valor={a.variacao} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="nota lista-dica">Use a <Star size={12} aria-label="estrela" style={{ display: 'inline', verticalAlign: '-1px' }} /> de qualquer ativo para pôr ou tirar da sua lista.</p>
        </section>

        {/* Detalhe do ativo */}
        <section className="painel mercado-detalhe" ref={detalheRef} style={{ scrollMarginTop: 80 }} aria-label={`${ativo.codigo}: ${ativo.nome}`}>
          <div className="ativo-cabecalho">
            <LogoAtivo codigo={ativo.codigo} tipo={ativo.tipo} logo={ativo.logo} tamanho={48} />
            <div className="ativo-identidade">
              <h2>{ativo.nome}</h2>
              <span className="ativo-meta">
                <b>{ativo.codigo}</b>
                <span>{NOME_TIPO[ativo.tipo]}</span>
                {ativo.setor && <span>{ativo.setor}</span>}
              </span>
            </div>
            <button type="button" className="botao-estrela" aria-pressed={naLista} onClick={alternar} disabled={!lista}>
              <Star size={18} aria-hidden fill={naLista ? 'currentColor' : 'none'} />
              <span>{naLista ? 'Na sua lista' : 'Acompanhar'}</span>
            </button>
          </div>
          {erroLista && <p className="aviso aviso-erro" style={{ margin: 0 }}>Não foi possível salvar sua lista: {erroLista}</p>}

          <div className="ativo-preco">
            {!cursor && catalogoMaisNovo && info?.preco ? (
              <>
                <span className="ativo-preco-valor">{fmt(info.preco)}</span>
                <PilulaVariacao valor={info.variacao} grande />
                <span className="nota">Atualizado em {formatarData(hojeSP(new Date(info.atualizado_em)))} às {new Date(info.atualizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              </>
            ) : legenda ? (
              <>
                <span className="ativo-preco-valor">{fmt(legenda.candle.fechamento)}</span>
                <PilulaVariacao valor={legenda.variacao} grande />
                <span className="nota">{cursor ? formatarData(legenda.candle.data) : `Fechamento de ${formatarData(legenda.candle.data)}`}</span>
              </>
            ) : info?.preco ? (
              <>
                <span className="ativo-preco-valor">{fmt(info.preco)}</span>
                <PilulaVariacao valor={info.variacao} grande />
              </>
            ) : <span className="esqueleto" style={{ width: 220, height: 40 }} />}
          </div>

          <div className="grafico-controles">
            <Seletor nome="periodo" rotulo="Período" valor={periodo} aoMudar={setPeriodo} opcoes={PERIODOS.map((p) => ({ valor: p, rotulo: p }))} />
            <Seletor nome="tipo" rotulo="Tipo de gráfico" valor={tipo} aoMudar={setTipo} opcoes={[
              { valor: 'candles', rotulo: <CandlestickChart size={16} aria-hidden />, titulo: 'Candles' },
              { valor: 'linha', rotulo: <LineChart size={16} aria-hidden />, titulo: 'Linha' },
            ]} />
            <label className="alternar-medias">
              <input type="checkbox" checked={medias} onChange={(e) => setMedias(e.target.checked)} />
              <span>Médias 20 e 50</span>
            </label>
          </div>

          {candles.carregando && !candles.dados && <div className="esqueleto" style={{ height: 360 }} />}
          {!candles.carregando && !candles.dados && <ErroCarga mensagem={candles.erro ?? ''} tentarDeNovo={candles.recarregar} />}
          {candles.dados && candles.dados.length === 0 && (
            <p className="corpo-pequeno suave" style={{ margin: 0 }}>Ainda não há histórico deste ativo. Tente de novo em alguns minutos.</p>
          )}
          {visiveis.length > 0 && <GraficoCandles candles={visiveis} tipo={tipo} medias={medias} casas={casas} aoMoverCursor={aoMoverCursor} />}

          <dl className="ativo-resumo">
            <div><dt>Abertura</dt><dd>{ultimo ? fmt(ultimo.abertura) : '—'}</dd></div>
            <div><dt>Máxima do dia</dt><dd>{ultimo ? fmt(ultimo.maxima) : '—'}</dd></div>
            <div><dt>Mínima do dia</dt><dd>{ultimo ? fmt(ultimo.minima) : '—'}</dd></div>
            <div><dt>Fechamento anterior</dt><dd>{anterior ? fmt(anterior.fechamento) : '—'}</dd></div>
            <div><dt>Volume</dt><dd>{formatarCompacto(ultimo?.volume || info?.volume)}</dd></div>
            <div><dt>Variação em {periodo}</dt><dd className={varPeriodo === null ? '' : varPeriodo >= 0 ? 'alta' : 'queda'}>{varPeriodo === null ? '—' : `${varPeriodo >= 0 ? '+' : ''}${formatarPercentual(varPeriodo)}`}</dd></div>
            {info?.valor_mercado ? <div><dt>Valor de mercado</dt><dd>R$ {formatarCompacto(info.valor_mercado)}</dd></div> : null}
            {min52 !== null && max52 !== null && ultimo && (
              <div className="ativo-faixa">
                <dt>Faixa de 52 semanas</dt>
                <dd>
                  <span>{fmt(min52)}</span>
                  <span className="faixa-barra" aria-hidden><i style={{ left: `${max52 > min52 ? ((ultimo.fechamento - min52) / (max52 - min52)) * 100 : 50}%` }} /></span>
                  <span>{fmt(max52)}</span>
                </dd>
              </div>
            )}
          </dl>
          <p className="nota">Passe o mouse ou toque no gráfico para ver cada dia. Fontes: Yahoo Finance e brapi, com atraso. Não é recomendação de compra ou venda.</p>
        </section>
      </div>

      <Explorador aoEscolher={escolher} lista={codigosLista} />

      {/* Notícias */}
      <section className="painel" id="noticias" style={{ scrollMarginTop: 80 }}>
        <div className="painel-titulo">
          <h2>Notícias de economia</h2>
          <span className="nota">Agência Brasil, g1 e InfoMoney</span>
        </div>
        {noticias.carregando && !noticias.dados && <div className="esqueleto" style={{ height: 300 }} />}
        {noticias.dados && <ListaNoticias noticias={noticias.dados} />}
        {!noticias.carregando && !noticias.dados && <ErroCarga mensagem={noticias.erro ?? ''} tentarDeNovo={noticias.recarregar} />}
        <p className="nota">As notícias abrem no site de cada veículo. O app não comenta nem recomenda com base nelas.</p>
      </section>
    </>
  );
}

/** Todos os ativos do catálogo, por aba, 25 de cada vez. */
function Explorador({ aoEscolher, lista }: { aoEscolher: (codigo: string) => void; lista: string[] }) {
  const [aba, setAba] = useState(ABAS[0].id);
  const [itens, setItens] = useState<AtivoCatalogo[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const filtro = ABAS.find((a) => a.id === aba)!.filtro;

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    listarAtivos(filtro, pagina)
      .then((r) => {
        if (!vivo) return;
        setItens((atual) => (pagina === 0 ? r.itens : [...atual, ...r.itens]));
        setTotal(r.total);
        setErro(null);
      })
      .catch((e: Error) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, [aba, pagina, tentativa]); // eslint-disable-line react-hooks/exhaustive-deps

  function trocar(id: string) {
    if (id === aba) return;
    setAba(id);
    setPagina(0);
    setItens([]);
  }

  return (
    <section className="painel explorador" aria-label="Explorar o mercado">
      <div className="painel-titulo">
        <h2>Explorar o mercado</h2>
        {total > 0 && <span className="nota">{total.toLocaleString('pt-BR')} ativos</span>}
      </div>
      <div className="abas-mercado" role="tablist" aria-label="Categorias">
        {ABAS.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={a.id === aba} onClick={() => trocar(a.id)}>{a.rotulo}</button>
        ))}
      </div>

      {erro && <ErroCarga mensagem={erro} tentarDeNovo={() => setTentativa((t) => t + 1)} />}
      {!erro && itens.length === 0 && carregando && <div className="esqueleto" style={{ height: 320 }} />}
      {!erro && itens.length === 0 && !carregando && (
        <p className="corpo-pequeno suave" style={{ margin: 0 }}>O catálogo ainda está sendo montado. Ele é atualizado todo dia útil.</p>
      )}
      {itens.length > 0 && (
        <table className="tabela-mercado">
          <thead>
            <tr><th>Ativo</th><th className="num">Preço</th><th className="num">Dia</th><th className="num col-volume">Volume</th><th className="num col-valor">Valor de mercado</th></tr>
          </thead>
          <tbody>
            {itens.map((a) => (
              <tr key={a.codigo} onClick={() => aoEscolher(a.codigo)}>
                <td>
                  <button type="button" className="ativo-linha" onClick={(e) => { e.stopPropagation(); aoEscolher(a.codigo); }}>
                    <LogoAtivo codigo={a.codigo} tipo={a.tipo} logo={a.logo_url} tamanho={32} />
                    <span><b>{a.codigo}{lista.includes(a.codigo) && <Star size={12} aria-label=", na sua lista" fill="currentColor" className="estrela-lista" />}</b><small>{descricaoAtivo(a)}</small></span>
                  </button>
                </td>
                <td className="num">{a.preco !== null ? formatarPreco(a.preco, unidadeDe(a), a.tipo) : '—'}</td>
                <td className="num"><PilulaVariacao valor={a.variacao} /></td>
                <td className="num col-volume">{formatarCompacto(a.volume)}</td>
                <td className="num col-valor">{a.valor_mercado ? `R$ ${formatarCompacto(a.valor_mercado)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {itens.length > 0 && itens.length < total && (
        <button type="button" className="botao botao-secundario mostrar-mais" disabled={carregando} onClick={() => setPagina((p) => p + 1)}>
          {carregando ? 'Carregando…' : `Mostrar mais (${(total - itens.length).toLocaleString('pt-BR')} restantes)`}
        </button>
      )}
      <p className="nota">Altas e baixas consideram só ativos com volume relevante no dia. Toque num ativo para ver o gráfico.</p>
    </section>
  );
}
