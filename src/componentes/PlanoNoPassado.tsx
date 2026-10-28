import { useEffect, useMemo, useState } from 'react';
import { simularPlanoNoPassado, type PontoPreco } from '../domain/simulacoes';
import type { PontoSerie } from '../domain/rendaFixa';
import type { DadosCarteira } from '../lib/dados';
import { pesosDoPerfil } from '../lib/dados';
import { formatarMoeda, lerMoeda } from '../lib/formato';
import { carregarCdiDiario, carregarPrecos } from '../lib/simulacoes';
import { ErroCarga } from './base';
import { GraficoEvolucao } from './graficos';
import { Campo } from './base';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (aaaamm: string) => `${MESES[Number(aaaamm.slice(5, 7)) - 1]}/${aaaamm.slice(0, 4)}`;

function mesesAtras(hoje: string, n: number): string {
  const [a, m] = hoje.split('-').map(Number);
  const total = a * 12 + (m - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** "Se eu tivesse seguido meu plano nos últimos X meses, quanto teria hoje?" */
export function PlanoNoPassado({ d, aporteInicial }: { d: DadosCarteira; aporteInicial: number }) {
  const [aporteTexto, setAporteTexto] = useState((aporteInicial / 100).toLocaleString('pt-BR'));
  const [meses, setMeses] = useState<12 | 24>(12);
  const [dados, setDados] = useState<{ acoes: PontoPreco[]; exterior: PontoPreco[]; cdi: PontoSerie[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    Promise.all([
      carregarPrecos(d.perfil.etf_acoes_br, 2.2),
      carregarPrecos(d.perfil.etf_exterior, 2.2),
      carregarCdiDiario(`${mesesAtras(d.hoje, 25)}-01`),
    ])
      .then(([acoes, exterior, cdi]) => vivo && setDados({ acoes, exterior, cdi }))
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : 'Falha ao carregar o histórico.'));
    return () => {
      vivo = false;
    };
  }, [d.perfil.etf_acoes_br, d.perfil.etf_exterior, d.hoje, tentativa]);

  const aporte = lerMoeda(aporteTexto) ?? 0;
  const mesInicial = mesesAtras(d.hoje, meses - 1);
  const resultado = useMemo(() => {
    if (!dados || aporte <= 0) return null;
    return simularPlanoNoPassado({
      aporteMensal: aporte, pesos: pesosDoPerfil(d.perfil),
      etfAcoes: dados.acoes, etfExterior: dados.exterior, cdiDiario: dados.cdi,
      mesInicial, hoje: d.hoje,
    });
  }, [dados, aporte, mesInicial, d]);

  const historicoCurto = dados && resultado && resultado.aportes < meses - 1;
  const pct = resultado && resultado.totalAportado ? (resultado.rendimento / resultado.totalAportado) * 100 : 0;

  return (
    <section className="painel">
      <div className="painel-titulo">
        <h2>Seu plano no passado</h2>
        <div className="seletor" role="radiogroup" aria-label="Período">
          {([12, 24] as const).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={meses === n} onClick={() => setMeses(n)}>
              {meses === n && <span className="seletor-fundo" />}
              <span>{n} meses</span>
            </button>
          ))}
        </div>
      </div>
      <p className="corpo-pequeno suave" style={{ margin: 0 }}>
        E se você tivesse seguido as suas regras ({d.perfil.pct_renda_fixa}% renda fixa, {d.perfil.pct_acoes_br}% {d.perfil.etf_acoes_br},{' '}
        {d.perfil.pct_exterior}% {d.perfil.etf_exterior}) todo mês, com os preços reais?
      </p>
      <div style={{ maxWidth: 240 }}>
        <Campo rotulo="Aporte por mês (R$)" numerico value={aporteTexto} onChange={(e) => setAporteTexto(e.target.value)} />
      </div>

      {erro && <ErroCarga mensagem={erro} tentarDeNovo={() => setTentativa((t) => t + 1)} />}
      {!erro && !dados && <div className="esqueleto" style={{ height: 240 }} />}
      {dados && resultado && resultado.aportes === 0 && (
        <p className="corpo-pequeno suave" style={{ margin: 0 }}>Ainda não há histórico de preços para simular. Ele chega com a primeira coleta de dados.</p>
      )}
      {resultado && resultado.aportes > 0 && (
        <>
          <div className="comparativo">
            <div><span>Você teria hoje</span><b>{formatarMoeda(resultado.valorFinal)}</b></div>
            <div><span>Do seu bolso</span><b>{formatarMoeda(resultado.totalAportado)}</b></div>
            <div><span>Rendimento</span><b className={resultado.rendimento >= 0 ? 'alta' : 'queda'}>{resultado.rendimento >= 0 ? '+' : '−'}{formatarMoeda(Math.abs(resultado.rendimento))} ({pct >= 0 ? '+' : '−'}{Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)</b></div>
          </div>
          <GraficoEvolucao pontos={resultado.pontos.map((p) => ({ data: p.data, valor: p.valor, aplicado: p.aportado }))} altura={220} />
          <p className="nota">
            {resultado.aportes} aportes de {formatarMoeda(aporte)}, de {nomeMes(mesInicial)} até hoje, no primeiro pregão de cada mês, com o mesmo
            rateio do app. Renda fixa rendendo 100% do CDI; ETFs pelo preço de fechamento. Sem custos e sem imposto.
            {historicoCurto ? ' O histórico de preços disponível é menor que o período escolhido.' : ''} O passado não garante o futuro.
          </p>
        </>
      )}
    </section>
  );
}
