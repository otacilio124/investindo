import { ArrowLeft, Download, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErroCarga } from '../componentes/base';
import { CabecalhoPagina } from '../componentes/Estrutura';
import { apurarVendasDeEtf, bensEDireitos, CODIGO_DARF } from '../domain/impostoRenda';
import { NOME_CLASSE } from '../domain/tipos';
import { carregarCarteira, useCarregar } from '../lib/dados';
import { formatarData, formatarMoeda } from '../lib/formato';
import { useSessao } from '../lib/sessao';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (aaaamm: string) => `${MESES[Number(aaaamm.slice(5, 7)) - 1]} de ${aaaamm.slice(0, 4)}`;

const COMO_DECLARAR: Record<string, string> = {
  etf: 'Ficha "Bens e Direitos", grupo de Fundos, opção de fundos de índice (ETF). Informe o código (ex.: BOVA11), o CNPJ do fundo e o custo de aquisição.',
  tesouro: 'Ficha "Bens e Direitos", grupo de Aplicações e Investimentos, opção de títulos públicos. Use o informe de rendimentos da corretora.',
  cdb: 'Ficha "Bens e Direitos", grupo de Aplicações e Investimentos (CDB, RDB). O banco envia o informe de rendimentos com os valores.',
  lci_lca: 'Ficha "Bens e Direitos" (Aplicações e Investimentos) e o rendimento em "Rendimentos Isentos e Não Tributáveis".',
  fundo: 'Ficha "Bens e Direitos", grupo de Fundos. O banco desconta o IR (come-cotas em maio e novembro) e manda o informe de rendimentos com o código certo.',
  outro: 'Confira no informe de rendimentos da instituição em que o investimento está.',
};

export default function Impostos() {
  const { sessao } = useSessao();
  const r = useCarregar(sessao ? `carteira:${sessao.user.id}` : null, carregarCarteira);
  const anoAtual = Number(new Date().getFullYear());
  const [ano, setAno] = useState(anoAtual - 1);

  const apuracao = useMemo(() => (r.dados ? apurarVendasDeEtf(r.dados.ativos, r.dados.movimentacoes) : []), [r.dados]);
  const bens = useMemo(() => (r.dados ? bensEDireitos(r.dados.ativos, r.dados.movimentacoes, ano) : []), [r.dados, ano]);
  const anos = useMemo(() => {
    const primeiro = r.dados?.movimentacoes[0]?.data.slice(0, 4);
    const inicio = primeiro ? Number(primeiro) : anoAtual;
    return Array.from({ length: anoAtual - inicio + 1 }, (_, i) => anoAtual - i);
  }, [r.dados, anoAtual]);

  const cabecalho = (
    <>
      <Link to="/carteira" className="link-discreto"><ArrowLeft size={16} aria-hidden /> Carteira</Link>
      <CabecalhoPagina titulo="Imposto de Renda" contexto="Ajuda para pagar e declarar seus investimentos" />
    </>
  );
  if (r.carregando && !r.dados) return <>{cabecalho}<div className="esqueleto" style={{ height: 300 }} /></>;
  if (!r.dados) return <>{cabecalho}<ErroCarga mensagem={r.erro ?? ''} tentarDeNovo={r.recarregar} /></>;

  const totalBens = bens.reduce((a, b) => a + b.custo, 0);
  const anoEmCurso = ano === anoAtual;

  function exportar() {
    const linhas = [['investimento', 'classe', 'quantidade', `custo_em_31_12_${ano}`].join(';')];
    for (const b of bens) {
      linhas.push([b.ativo.nome, NOME_CLASSE[b.ativo.classe], b.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 8 }), (b.custo / 100).toFixed(2).replace('.', ',')]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'));
    }
    const url = URL.createObjectURL(new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `investindo-bens-e-direitos-${ano}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {cabecalho}

      <div className="grade">
        <section className="painel n-12">
          <div className="painel-titulo"><h2>Vendas de ETF: imposto a pagar</h2></div>
          {apuracao.length === 0 ? (
            <p className="corpo-pequeno suave" style={{ margin: 0 }}>
              Você ainda não vendeu ETFs pelo app. <b>Enquanto você só compra, não há imposto a pagar.</b> Quando vender com lucro, o
              imposto do mês aparece aqui com o valor e a data do DARF.
            </p>
          ) : (
            <table className="posicoes">
              <thead>
                <tr><th>Mês</th><th className="num">Vendido</th><th className="num">Lucro / prejuízo</th><th className="num">Imposto (15%)</th><th className="num">DARF</th><th>Vencimento</th></tr>
              </thead>
              <tbody>
                {apuracao.map((m) => (
                  <tr key={m.mes}>
                    <td><b>{nomeMes(m.mes)}</b>{m.prejuizoCompensado > 0 && <small className="suave" style={{ display: 'block' }}>compensou {formatarMoeda(m.prejuizoCompensado)} de prejuízo</small>}</td>
                    <td className="num" data-movel="oculto">{formatarMoeda(m.totalVendido)}</td>
                    <td className={`num ${m.resultado >= 0 ? 'alta' : 'queda'}`}>{m.resultado >= 0 ? '+' : '−'}{formatarMoeda(Math.abs(m.resultado))}</td>
                    <td className="num" data-movel="oculto">{formatarMoeda(m.impostoDoMes)}</td>
                    <td className="num"><b>{m.darf > 0 ? formatarMoeda(m.darf) : '—'}</b></td>
                    <td data-movel="linha">
                      <small className="suave">
                        {m.darf > 0 ? `Pagar até ${formatarData(m.vencimento)}` : m.impostoDoMes > 0 ? 'Abaixo de R$ 10: soma no próximo DARF' : 'Nada a pagar'}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="nota">
            DARF com o código <b>{CODIGO_DARF}</b>, gerado no site da Receita (Sicalc) ou no app do banco. ETFs não têm a isenção de R$ 20 mil por
            mês das ações. Prejuízos de um mês abatem os lucros dos seguintes. Day trade tem outra regra e não está incluído.
          </p>
        </section>

        <section className="painel n-12">
          <div className="painel-titulo">
            <h2>Bens e Direitos em 31/12</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label className="visualmente-oculto" htmlFor="ano-ir">Ano</label>
              <select id="ano-ir" value={ano} onChange={(e) => setAno(Number(e.target.value))} className="chip" style={{ minHeight: 36 }}>
                {anos.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              {bens.length > 0 && <button type="button" className="botao botao-secundario" onClick={exportar}><Download size={16} aria-hidden /> CSV</button>}
              <Link to={`/impostos/relatorio?ano=${ano}`} className="botao botao-principal"><FileText size={16} aria-hidden /> Relatório em PDF</Link>
            </div>
          </div>
          {anoEmCurso && <p className="aviso aviso-info" style={{ margin: 0 }}>{ano} ainda não terminou: esta é uma prévia com o que você tem hoje.</p>}
          {bens.length === 0 ? (
            <p className="corpo-pequeno suave" style={{ margin: 0 }}>Você não tinha investimentos registrados em 31/12/{ano}.</p>
          ) : (
            <table className="posicoes">
              <thead><tr><th>Investimento</th><th className="num">Quantidade</th><th className="num">Custo (o que declarar)</th></tr></thead>
              <tbody>
                {bens.map((b) => (
                  <tr key={b.ativo.id}>
                    <td>
                      <div className="ativo-celula">
                        <b>{b.ativo.nome}</b>
                        <small>{COMO_DECLARAR[b.ativo.tipo] ?? COMO_DECLARAR.outro}</small>
                      </div>
                    </td>
                    <td className="num" data-movel="oculto">{b.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</td>
                    <td className="num"><b>{formatarMoeda(b.custo)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {bens.length > 0 && <p className="nota">Total pelo custo de aquisição: <b>{formatarMoeda(totalBens)}</b>.</p>}
          <p className="nota">
            Na declaração, investimentos entram pelo <b>custo de aquisição</b> (o que você pagou), e não pelo valor de mercado. Os rendimentos da renda
            fixa já têm o imposto descontado pelo banco; os valores exatos vêm no informe de rendimentos de cada instituição. Esta tela é uma ajuda:
            confira com o informe e, se tiver dúvida, com um contador.
          </p>
        </section>
      </div>
    </>
  );
}
