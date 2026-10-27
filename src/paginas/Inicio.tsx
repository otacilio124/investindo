import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Lightbulb } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AvisoCache, BarraReserva, ErroCarga } from '../componentes/base';
import { ComecePorAqui } from '../componentes/ComecePorAqui';
import { CabecalhoPagina } from '../componentes/Estrutura';
import { ListaNoticias } from '../componentes/mercado';
import { BarraAlocacao, Sparkline } from '../componentes/minigraficos';
import { NumeroAnimado } from '../componentes/movimento';
import { dataPorExtenso, Dica, GLOSSARIO, saudacao } from '../componentes/ui';
import { classesDesviadas } from '../domain/carteira';
import { somarDias } from '../domain/calendario';
import { NOME_CLASSE } from '../domain/tipos';
import {
  carregarAporteDoMes,
  carregarCarteira,
  estaDesatualizado,
  montarContextoRateio,
  resumoDaCarteira,
  useCarregar,
  type AporteDoMes,
  type DadosCarteira,
} from '../lib/dados';
import { useEvolucao } from '../lib/evolucao';
import { formatarData, formatarMoeda, formatarPercentual, formatarTaxa } from '../lib/formato';
import { carregarNoticias, carregarResumoMercado, carregarSerieIndicador, formatarPreco, PAINEL_MERCADO } from '../lib/mercado';
import { useSessao } from '../lib/sessao';

const anualizar = (diaria: number) => (Math.pow(1 + diaria / 100, 252) - 1) * 100;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* ------------------------------------------------------------------ */

function AporteDoMesPainel({ aporte, d }: { aporte: AporteDoMes | null; d: DadosCarteira }) {
  const mes = MESES[Number(d.hoje.slice(5, 7)) - 1];
  const diaAporte = d.perfil.dia_aporte;
  const hojeDia = Number(d.hoje.slice(8, 10));
  const status = aporte?.status ?? 'nenhum';
  const estado = (passo: 1 | 2 | 3) => {
    const atual = status === 'nenhum' ? 1 : status === 'sugerido' ? 2 : 4;
    return passo < atual ? 'feito' : passo === atual ? 'atual' : 'futuro';
  };

  let cta: ReactNode;
  if (status === 'confirmado') {
    const proximoMes = MESES[Number(d.hoje.slice(5, 7)) % 12];
    cta = (
      <p className="corpo-pequeno" style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
        <CheckCircle2 size={18} className="icone alta" aria-hidden />
        Feito: {formatarMoeda(Math.round((aporte?.valor ?? 0) * 100))} em {formatarData(aporte?.data)}. Próximo: {diaAporte} de {proximoMes}.
      </p>
    );
  } else if (status === 'sugerido') {
    cta = <Link to="/investir" className="botao botao-principal botao-largo">Confirmar o que comprei <ArrowRight size={18} aria-hidden /></Link>;
  } else {
    cta = <Link to="/investir" className="botao botao-principal botao-largo">Calcular o aporte <ArrowRight size={18} aria-hidden /></Link>;
  }

  return (
    <section className="painel">
      <div className="painel-titulo">
        <h2>Aporte de {mes}</h2>
        {status !== 'confirmado' && (
          <span className="corpo-pequeno suave" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <Clock3 size={15} aria-hidden /> {hojeDia === diaAporte ? 'é hoje' : hojeDia < diaAporte ? `dia ${diaAporte}` : `era dia ${diaAporte}`}
          </span>
        )}
      </div>
      <ol className="passos">
        <li data-estado={estado(1)}><div><b>Calcular o rateio</b><span>Digite quanto vai investir.</span></div></li>
        <li data-estado={estado(2)}><div><b>Comprar no seu banco</b><span>Siga a lista do app.</span></div></li>
        <li data-estado={estado(3)}><div><b>Confirmar a compra</b><span>A carteira se atualiza sozinha.</span></div></li>
      </ol>
      {cta}
    </section>
  );
}

/* ------------------------------------------------------------------ */

export default function Inicio() {
  const { sessao } = useSessao();
  const local = useLocation();
  const aviso = (local.state as { aviso?: string } | null)?.aviso;
  const r = useCarregar(sessao ? `carteira:${sessao.user.id}` : null, carregarCarteira);
  const aporte = useCarregar(null, carregarAporteDoMes);
  const mercado = useCarregar('mercado:inicio', () => carregarResumoMercado(PAINEL_MERCADO));
  const noticias = useCarregar('noticias:inicio', () => carregarNoticias(5));
  const series = useCarregar('series:inicio', async () => {
    const [cdi, selic, ipca] = await Promise.all([
      carregarSerieIndicador('cdi_diario', 120),
      carregarSerieIndicador('selic_diaria', 120),
      carregarSerieIndicador('ipca_mes', 24),
    ]);
    return { cdi: cdi.map(anualizar), selic: selic.map(anualizar), ipca };
  });
  const evolucao = useEvolucao(r.dados, 180);
  const [agora] = useState(() => new Date());
  useEffect(() => {
    window.history.replaceState({}, '');
  }, []);

  const dolar = mercado.dados?.find((a) => a.codigo === 'USDBRL');
  const indicadores = useMemo(() => [
    { codigo: 'selic_meta', nome: 'Selic', dica: GLOSSARIO.selic, formato: formatarTaxa, serie: series.dados?.selic },
    { codigo: 'cdi_anual', nome: 'CDI', dica: GLOSSARIO.cdi, formato: formatarTaxa, serie: series.dados?.cdi },
    { codigo: 'ipca_12m', nome: 'Inflação (IPCA 12 meses)', dica: GLOSSARIO.ipca, formato: (v: number) => formatarPercentual(v), serie: series.dados?.ipca },
    { codigo: 'juro_real', nome: 'Juro real', dica: GLOSSARIO.jurosReal, formato: formatarTaxa },
    { codigo: 'juro_real_esperado', nome: 'Juro real esperado', dica: GLOSSARIO.jurosRealEsperado, formato: formatarTaxa },
    { codigo: 'dolar_ptax', nome: 'Dólar', dica: GLOSSARIO.dolar, formato: (v: number) => `R$ ${v.toFixed(4).replace('.', ',')}`, serie: dolar?.serie },
  ], [series.dados, dolar]);

  const nome = r.dados?.perfil.nome.split(' ')[0];
  const cabecalho = <CabecalhoPagina contexto={dataPorExtenso(agora)} titulo={`${saudacao(agora)}${nome ? `, ${nome}` : ''}`} />;

  if (r.carregando && !r.dados) {
    return (
      <>
        {cabecalho}
        <div className="grade">
          <div className="esqueleto n-8" style={{ height: 220 }} />
          <div className="esqueleto n-4" style={{ height: 220 }} />
        </div>
      </>
    );
  }
  if (!r.dados) return <>{cabecalho}<ErroCarga mensagem={r.erro ?? ''} tentarDeNovo={r.recarregar} /></>;

  const d = r.dados;
  const resumo = resumoDaCarteira(d);
  const rendimento = resumo.total - resumo.totalAplicado;
  const pct = resumo.totalAplicado > 0 ? (rendimento / resumo.totalAplicado) * 100 : 0;
  // Mesma regra do rateio: falta menor que a compra mínima do produto conta como completa.
  const faltaBruta = Math.max(0, resumo.metaReserva - resumo.totalReserva);
  const tolerancia = Math.max(montarContextoRateio(d).entrada.reserva.minimo ?? 0, 100);
  const faltaReserva = faltaBruta < tolerancia ? 0 : faltaBruta;
  const ultimaAtualizacao = Object.values(d.indicadores).reduce((a, i) => (i.atualizado_em > a ? i.atualizado_em : a), '');

  // Pontos de atenção: o que merece uma decisão, em linguagem direta.
  const atencao: { icone: 'alerta' | 'dica'; texto: ReactNode }[] = [];
  for (const c of classesDesviadas(resumo.classes)) {
    const abaixo = c.percentualAtual < (c.percentualAlvo ?? 0);
    atencao.push({
      icone: 'dica',
      texto: <>{NOME_CLASSE[c.classe]} está {abaixo ? 'abaixo' : 'acima'} do alvo ({formatarPercentual(c.percentualAtual, 0)} de {formatarPercentual(c.percentualAlvo ?? 0, 0)}). {abaixo ? 'O próximo aporte vai priorizar essa classe.' : 'Ela vai receber menos nos próximos aportes.'}</>,
    });
  }
  if (Number(d.perfil.caixa_pendente) > 0) {
    atencao.push({ icone: 'dica', texto: <>{formatarMoeda(Math.round(Number(d.perfil.caixa_pendente) * 100))} guardados do mês passado entram no próximo aporte.</> });
  }
  const velhos = Object.values(d.indicadores).filter((i) => estaDesatualizado(i, d.hoje));
  if (velhos.length) atencao.push({ icone: 'alerta', texto: <>Alguns indicadores não foram atualizados ({velhos.map((i) => i.nome).join(', ')}). Mostramos o último valor conhecido.</> });
  if (!d.perfil.revisado_em || d.perfil.revisado_em < somarDias(d.hoje, -365)) {
    atencao.push({ icone: 'dica', texto: <>Faz mais de um ano que você revisou seu perfil. <Link to="/configuracoes">Revisar agora</Link></> });
  }

  return (
    <>
      {cabecalho}
      {aviso && <div className="aviso aviso-info" role="status">{aviso}</div>}
      <AvisoCache salvoEm={r.doCacheDe} />
      <ComecePorAqui d={d} reservaCompleta={faltaReserva === 0} />

      <div className="grade">
        {/* Patrimônio */}
        <section className="destaque n-8">
          <div className="destaque-linha">
            <div style={{ display: 'grid', gap: 8 }}>
              <span className="rotulo">Seu patrimônio</span>
              <NumeroAnimado className="destaque-valor" valor={resumo.total} formatar={(v) => formatarMoeda(Math.round(v))} />
              {resumo.totalAplicado > 0 && (
                <span className="corpo-pequeno">
                  {rendimento >= 0 ? '▲' : '▼'} {formatarMoeda(Math.abs(rendimento))} ({formatarPercentual(pct)}) sobre o que você aplicou
                </span>
              )}
            </div>
            {evolucao && evolucao.length > 2 && (
              <Sparkline valores={evolucao.map((p) => p.valor)} largura={220} altura={72} cor="#3DCB85" />
            )}
          </div>
          <BarraAlocacao partes={resumo.classes.map((c) => ({
            rotulo: NOME_CLASSE[c.classe], valor: c.valorBruto,
            cor: { reserva: 'rgba(255,255,255,.4)', renda_fixa: 'rgba(255,255,255,.92)', acoes_br: '#3DCB85', exterior: '#E8B84A' }[c.classe],
          }))} />
        </section>

        {/* O que fazer agora */}
        <div className="n-4 t-12">
          <AporteDoMesPainel aporte={aporte.dados} d={d} />
        </div>

        {/* Reserva */}
        <section className="painel n-4 t-6">
          <div className="painel-titulo">
            <h2 style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Reserva de emergência <Dica sobre="reserva de emergência" texto={GLOSSARIO.reserva} /></h2>
          </div>
          <div className="linha-entre">
            <span className="valor-medio">{formatarMoeda(resumo.totalReserva)}</span>
            <span className="corpo-pequeno suave">de {formatarMoeda(resumo.metaReserva)}</span>
          </div>
          <BarraReserva saldo={resumo.totalReserva} meta={resumo.metaReserva} />
          <p className="nota">
            {faltaReserva > 0
              ? `Faltam ${formatarMoeda(faltaReserva)}. Até completar, seus aportes vão primeiro para cá.`
              : 'Completa. Seus aportes agora vão para os investimentos.'}
          </p>
        </section>

        {/* Atenção */}
        <section className="painel n-4 t-6">
          <div className="painel-titulo"><h2>Para ficar de olho</h2></div>
          {atencao.length === 0
            ? <p className="corpo-pequeno suave" style={{ margin: 0 }}>Tudo em ordem. Sua carteira está perto do alvo.</p>
            : (
              <ul className="atencao">
                {atencao.slice(0, 4).map((a, i) => (
                  <li key={i}>
                    {a.icone === 'alerta' ? <AlertCircle size={18} className="icone queda" aria-hidden /> : <Lightbulb size={18} className="icone" style={{ color: 'var(--ouro)' }} aria-hidden />}
                    <span>{a.texto}</span>
                  </li>
                ))}
              </ul>
            )}
        </section>

        {/* Mercado */}
        <section className="painel n-4 t-12">
          <div className="painel-titulo">
            <h2>Mercado hoje</h2>
            <Link to="/mercado">Ver gráficos <ArrowRight size={15} aria-hidden /></Link>
          </div>
          {!mercado.dados && <div className="esqueleto" style={{ height: 140 }} />}
          {mercado.dados && (
            <ul className="linhas">
              {mercado.dados.map((a) => (
                <li key={a.codigo} className="linha-mercado" style={{ cursor: 'default' }}>
                  <div><b>{a.nome}</b>{a.nome !== a.codigo && <small>{a.codigo}</small>}</div>
                  <Sparkline valores={a.serie} largura={80} altura={28} area={false} />
                  <div className="preco">
                    <span className="valor-pequeno">{formatarPreco(a.ultimo, a.unidade)}</span>
                    <span className={`valor-pequeno ${a.variacao >= 0 ? 'alta' : 'queda'}`} style={{ fontSize: 12 }}>
                      {a.variacao >= 0 ? '▲ +' : '▼ '}{formatarPercentual(a.variacao)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Indicadores */}
        <section className="painel n-7">
          <div className="painel-titulo"><h2>Juros e inflação</h2></div>
          <ul className="linhas">
            {indicadores.map((i) => {
              const ind = d.indicadores[i.codigo];
              return (
                <li key={i.codigo} className="linha-indicador">
                  <span className="nome">
                    <span>{i.nome}{ind && <small>{formatarData(ind.data_referencia)}{estaDesatualizado(ind, d.hoje) ? ' · desatualizado' : ''}</small>}</span>
                    <Dica sobre={i.nome} texto={i.dica} />
                  </span>
                  {i.serie && i.serie.length > 1 ? <Sparkline valores={i.serie} largura={72} altura={24} area={false} cor="var(--tinta-suave)" /> : <span />}
                  <span className="valor-pequeno">{ind ? i.formato(ind.valor) : '—'}</span>
                </li>
              );
            })}
          </ul>
          <p className="nota">
            Banco Central e IBGE{ultimaAtualizacao && ` · atualizado em ${new Date(ultimaAtualizacao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </section>

        {/* Notícias */}
        <section className="painel n-5">
          <div className="painel-titulo">
            <h2>Notícias</h2>
            <Link to="/mercado#noticias">Todas <ArrowRight size={15} aria-hidden /></Link>
          </div>
          {noticias.dados ? <ListaNoticias noticias={noticias.dados} limite={5} compacta /> : <div className="esqueleto" style={{ height: 220 }} />}
        </section>
      </div>
    </>
  );
}
