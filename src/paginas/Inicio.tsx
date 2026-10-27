import { ArrowRight, CalendarClock, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AvisoCache, BarraReserva, Carregando, ErroCarga, FonteDado, Variacao } from '../componentes/base';
import { Cabecalho } from '../componentes/Estrutura';
import { BarraAlocacao, Sparkline } from '../componentes/minigraficos';
import { CartaoAtivo, FaixaCotacoes, ListaNoticias, StatusPregao } from '../componentes/mercado';
import { Grupo, Item, NumeroAnimado } from '../componentes/movimento';
import { classesDesviadas } from '../domain/carteira';
import { somarDias } from '../domain/calendario';
import { COR_CLASSE, NOME_CLASSE, type Classe } from '../domain/tipos';
import { carregarCarteira, estaDesatualizado, resumoDaCarteira, useCarregar, type IndicadorRow } from '../lib/dados';
import { formatarMoeda, formatarPercentual, formatarTaxa } from '../lib/formato';
import { carregarNoticias, carregarResumoMercado, carregarSerieIndicador, PAINEL_MERCADO } from '../lib/mercado';
import { useSessao } from '../lib/sessao';

const anualizar = (diaria: number) => (Math.pow(1 + diaria / 100, 252) - 1) * 100;

interface Painel {
  codigo: string;
  rotulo: string;
  explicacao?: string;
  formato: (v: number) => string;
  serie?: number[];
}

function CartaoIndicador({ rotulo, explicacao, formato, indicador, serie }: Painel & { indicador?: IndicadorRow }) {
  return (
    <article className="cartao pilha-curta cartao-interativo" style={{ height: '100%' }}>
      <h3 className="sobretitulo suave">{rotulo}</h3>
      <div className="indicador-topo">
        <p className="valor-medio">{indicador ? formato(indicador.valor) : '—'}</p>
        {serie && serie.length > 1 && <Sparkline valores={serie} largura={88} altura={30} cor="var(--floresta)" />}
      </div>
      {explicacao && <p className="legenda">{explicacao}</p>}
      {indicador
        ? <FonteDado fonte={indicador.fonte} data={indicador.data_referencia} desatualizado={estaDesatualizado(indicador)} />
        : <p className="legenda">Ainda sem dado coletado.</p>}
    </article>
  );
}

export default function Inicio() {
  const { sessao } = useSessao();
  const local = useLocation();
  const aviso = (local.state as { aviso?: string } | null)?.aviso;
  const r = useCarregar(sessao ? `carteira:${sessao.user.id}` : null, carregarCarteira);
  const mercado = useCarregar('mercado:inicio', () => carregarResumoMercado(PAINEL_MERCADO));
  const noticias = useCarregar('noticias:inicio', () => carregarNoticias(6));
  const series = useCarregar('series:inicio', async () => {
    const [cdi, selic, ipca] = await Promise.all([
      carregarSerieIndicador('cdi_diario', 120),
      carregarSerieIndicador('selic_diaria', 120),
      carregarSerieIndicador('ipca_mes', 24),
    ]);
    return { cdi: cdi.map(anualizar), selic: selic.map(anualizar), ipca };
  });
  const [agora] = useState(() => new Date());
  useEffect(() => window.history.replaceState({}, ''), []);

  const dolar = mercado.dados?.find((a) => a.codigo === 'USDBRL');
  const painel: Painel[] = useMemo(() => [
    { codigo: 'selic_meta', rotulo: 'Selic', formato: (v) => formatarTaxa(v), serie: series.dados?.selic },
    { codigo: 'cdi_anual', rotulo: 'CDI', formato: (v) => formatarTaxa(v), serie: series.dados?.cdi },
    { codigo: 'ipca_12m', rotulo: 'IPCA 12 meses', formato: (v) => formatarPercentual(v), serie: series.dados?.ipca, explicacao: 'Minigráfico: IPCA de cada mês, 2 anos.' },
    { codigo: 'juro_real', rotulo: 'Juro real', explicacao: 'Selic descontada a inflação dos últimos 12 meses.', formato: (v) => formatarTaxa(v) },
    { codigo: 'juro_real_esperado', rotulo: 'Juro real esperado', explicacao: 'Selic descontada a inflação que o mercado espera (Focus).', formato: (v) => formatarTaxa(v) },
    { codigo: 'dolar_ptax', rotulo: 'Dólar PTAX', formato: (v) => `R$ ${v.toFixed(4).replace('.', ',')}`, serie: dolar?.serie },
  ], [series.dados, dolar]);

  if (r.carregando && !r.dados) {
    return (
      <>
        <Cabecalho sobretitulo="Patrimônio" valor={<span className="esqueleto" style={{ display: 'inline-block', width: 220, height: 40, background: 'rgba(255,255,255,.08)', border: 0 }} />} />
        <main className="pagina"><Carregando /></main>
      </>
    );
  }
  if (!r.dados) return <><Cabecalho /><main className="pagina"><ErroCarga mensagem={r.erro ?? ''} tentarDeNovo={r.recarregar} /></main></>;

  const d = r.dados;
  const resumo = resumoDaCarteira(d);
  const rendimento = resumo.total - resumo.totalAplicado;
  const pctRendimento = resumo.totalAplicado > 0 ? (rendimento / resumo.totalAplicado) * 100 : 0;
  const desviadas = classesDesviadas(resumo.classes);
  const diaDeAporte = agora.getDate() === d.perfil.dia_aporte;
  const revisaoVencida = !d.perfil.revisado_em || d.perfil.revisado_em < somarDias(d.hoje, -365);
  const faltaReserva = Math.max(0, resumo.metaReserva - resumo.totalReserva);
  const partes = resumo.classes.map((c) => ({ rotulo: NOME_CLASSE[c.classe as Classe], valor: c.valorBruto, cor: COR_CLASSE[c.classe as Classe] }));

  return (
    <>
      <Cabecalho sobretitulo="Patrimônio" valor={<NumeroAnimado valor={resumo.total} formatar={(v) => formatarMoeda(Math.round(v))} />}>
        <div className="linha-entre" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {resumo.totalAplicado > 0 ? <Variacao valor={rendimento} percentual={pctRendimento} /> : <span />}
          <StatusPregao />
        </div>
        <BarraAlocacao partes={partes.map((p) => ({ ...p, cor: p.cor === 'var(--floresta)' ? 'var(--sobre-floresta)' : p.cor }))} />
      </Cabecalho>
      {mercado.dados && <FaixaCotacoes ativos={mercado.dados} />}

      <main className="pagina">
        {aviso && <div className="aviso aviso-info" role="status">{aviso}</div>}
        <AvisoCache salvoEm={r.doCacheDe} />

        <div className="dois-colunas">
          <Grupo className="pilha">
            {diaDeAporte && (
              <Item className="aviso aviso-conquista" >
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><CalendarClock size={20} className="icone" aria-hidden /> Hoje é dia de aporte. Hora de investir.</span>
              </Item>
            )}

            <Item como="section" className="cartao pilha">
              <div className="linha-entre">
                <h2 className="subtitulo">Reserva de emergência</h2>
                <span className="valor-pequeno">{formatarMoeda(resumo.totalReserva)}</span>
              </div>
              <BarraReserva saldo={resumo.totalReserva} meta={resumo.metaReserva} />
              <p className="corpo-pequeno suave">
                {faltaReserva > 0
                  ? <>Meta de {formatarMoeda(resumo.metaReserva)}. Faltam <span className="valor-pequeno">{formatarMoeda(faltaReserva)}</span>; até completar, o aporte vai para a reserva.</>
                  : <>Reserva completa. Agora o aporte vai para os investimentos.</>}
              </p>
            </Item>

            <Item>
              <Link to="/investir" className="botao botao-principal botao-largo">
                <TrendingUp size={20} className="icone" aria-hidden /> Investir este mês
              </Link>
            </Item>

            {desviadas.length > 0 && (
              <Item className="aviso aviso-info">
                {desviadas.map((c) => NOME_CLASSE[c.classe]).join(' e ')} {desviadas.length > 1 ? 'estão' : 'está'} a mais de 5 pontos do alvo.
                O próximo aporte corrige isso sem precisar vender nada.
              </Item>
            )}
            {revisaoVencida && (
              <Item className="aviso aviso-info">Faz mais de um ano que você revisou seu perfil. <Link to="/configuracoes">Revisar agora</Link></Item>
            )}

            <Item como="section" className="pilha">
              <h2 className="subtitulo">Indicadores do dia</h2>
              <Grupo className="grade-indicadores">
                {painel.map((p) => <Item key={p.codigo}><CartaoIndicador {...p} indicador={d.indicadores[p.codigo]} /></Item>)}
              </Grupo>
            </Item>
          </Grupo>

          <Grupo className="pilha">
            <Item como="section" className="pilha">
              <div className="linha-entre">
                <h2 className="subtitulo">Mercado agora</h2>
                <Link to="/mercado" className="corpo-pequeno" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>Gráficos <ArrowRight size={16} className="icone" aria-hidden /></Link>
              </div>
              {mercado.carregando && !mercado.dados && <div className="esqueleto" style={{ height: 116 }} />}
              <div className="grade-ativos" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                {mercado.dados?.map((a) => <Link key={a.codigo} to="/mercado" style={{ textDecoration: 'none' }}><CartaoAtivo a={a} /></Link>)}
              </div>
            </Item>
            <Item como="section" className="pilha">
              <div className="linha-entre">
                <h2 className="subtitulo">Últimas notícias</h2>
                <Link to="/mercado" className="corpo-pequeno">Ver todas</Link>
              </div>
              {noticias.dados ? <ListaNoticias noticias={noticias.dados} limite={5} compacta /> : <div className="esqueleto" style={{ height: 240 }} />}
            </Item>
          </Grupo>
        </div>
      </main>
    </>
  );
}
