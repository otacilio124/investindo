import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Carregando, ErroCarga, Logotipo } from '../componentes/base';
import { apurarVendasDeEtf, bensEDireitos, CODIGO_DARF, type BemOuDireito } from '../domain/impostoRenda';
import { NOME_CLASSE } from '../domain/tipos';
import { carregarCarteira, useCarregar } from '../lib/dados';
import { formatarData, formatarMoeda } from '../lib/formato';
import { useSessao } from '../lib/sessao';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (aaaamm: string) => MESES[Number(aaaamm.slice(5, 7)) - 1];
const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 8 });

const DISCRIMINACAO: Record<string, string> = {
  etf: 'Fundos (07) · Fundos de índice / ETF (08)',
  tesouro: 'Aplicações e investimentos (04) · Títulos públicos (02)',
  cdb: 'Aplicações e investimentos (04) · CDB, RDB e outros (02)',
  lci_lca: 'Aplicações e investimentos (04) · LCI, LCA e outros (03)',
  fundo: 'Fundos (07) · código conforme o informe do banco',
  outro: 'Confira no informe de rendimentos',
};

/**
 * Relatório anual para a declaração do IR, pensado para papel: o botão chama a
 * impressão do navegador, que salva em PDF. Traz Bens e Direitos em 31/12 do
 * ano anterior e do ano (a declaração pede os dois), as vendas de ETF com os
 * DARFs e todas as movimentações do ano.
 */
export default function RelatorioIR() {
  const { sessao } = useSessao();
  const [params] = useSearchParams();
  const anoAtual = new Date().getFullYear();
  const ano = Number(params.get('ano')) || anoAtual - 1;
  const r = useCarregar(sessao ? `carteira:${sessao.user.id}` : null, carregarCarteira);

  const dados = useMemo(() => {
    if (!r.dados) return null;
    const { ativos, movimentacoes } = r.dados;
    const anterior = new Map(bensEDireitos(ativos, movimentacoes, ano - 1).map((b) => [b.ativo.id, b]));
    const atual = bensEDireitos(ativos, movimentacoes, ano);
    // Bens que existiam no ano anterior e foram vendidos por inteiro também entram (com zero em 31/12).
    const linhas: { ativoId: string; antes?: BemOuDireito; depois?: BemOuDireito }[] = atual.map((b) => ({ ativoId: b.ativo.id, depois: b, antes: anterior.get(b.ativo.id) }));
    for (const [id, b] of anterior) if (!atual.some((x) => x.ativo.id === id)) linhas.push({ ativoId: id, antes: b });
    const vendas = apurarVendasDeEtf(ativos, movimentacoes).filter((m) => m.mes.startsWith(`${ano}-`));
    const porId = new Map(ativos.map((a) => [a.id, a]));
    const movs = movimentacoes.filter((m) => m.data.startsWith(`${ano}-`));
    return { linhas, vendas, movs, porId };
  }, [r.dados, ano]);

  useEffect(() => {
    document.title = `Investindo! · IR ${ano}`;
    return () => { document.title = 'Investindo!'; };
  }, [ano]);

  if (r.carregando && !r.dados) return <main className="centro-tela"><Carregando texto="Montando o relatório…" /></main>;
  if (!r.dados || !dados) return <main className="pagina"><ErroCarga mensagem={r.erro ?? ''} tentarDeNovo={r.recarregar} /></main>;

  const nome = r.dados.perfil.nome || sessao?.user.email || '';
  const totalAntes = dados.linhas.reduce((a, l) => a + (l.antes?.custo ?? 0), 0);
  const totalDepois = dados.linhas.reduce((a, l) => a + (l.depois?.custo ?? 0), 0);
  const totalDarf = dados.vendas.reduce((a, m) => a + m.darf, 0);

  return (
    <main className="relatorio">
      <div className="relatorio-acoes">
        <Link to="/impostos" className="botao botao-secundario"><ArrowLeft size={18} aria-hidden /> Voltar</Link>
        <button className="botao botao-principal" onClick={() => window.print()}><Printer size={18} aria-hidden /> Salvar em PDF ou imprimir</button>
      </div>

      <header className="relatorio-cabecalho">
        <Logotipo largura={170} />
        <div>
          <h1>Relatório para o Imposto de Renda {ano}</h1>
          <p>{nome} · gerado em {formatarData(r.dados.hoje)}</p>
        </div>
      </header>

      {ano >= anoAtual && <p className="aviso aviso-info">{ano} ainda não terminou: os valores de 31/12/{ano} são uma prévia com o que você tem hoje.</p>}

      <section>
        <h2>1. Bens e Direitos</h2>
        <p className="relatorio-nota">Valores pelo custo de aquisição (o que você pagou), como a Receita pede. Não é o valor de mercado.</p>
        {dados.linhas.length === 0 ? (
          <p>Nenhum investimento registrado em 31/12/{ano - 1} nem em 31/12/{ano}.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Investimento</th><th>Grupo · código</th><th className="num">Qtd. em 31/12/{ano}</th><th className="num">31/12/{ano - 1}</th><th className="num">31/12/{ano}</th></tr>
            </thead>
            <tbody>
              {dados.linhas.map((l) => {
                const a = (l.depois ?? l.antes)!.ativo;
                return (
                  <tr key={l.ativoId}>
                    <td><b>{a.nome}</b><small>{NOME_CLASSE[a.classe]}</small></td>
                    <td>{DISCRIMINACAO[a.tipo] ?? DISCRIMINACAO.outro}</td>
                    <td className="num">{l.depois ? qtd(l.depois.quantidade) : '0'}</td>
                    <td className="num">{formatarMoeda(l.antes?.custo ?? 0)}</td>
                    <td className="num">{formatarMoeda(l.depois?.custo ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr><td colSpan={3}>Total</td><td className="num">{formatarMoeda(totalAntes)}</td><td className="num">{formatarMoeda(totalDepois)}</td></tr>
            </tfoot>
          </table>
        )}
        <p className="relatorio-nota">
          Na discriminação de cada bem, informe a quantidade, o nome do produto, a instituição (corretora ou banco) e, para ETFs, o CNPJ do fundo.
        </p>
      </section>

      <section>
        <h2>2. Vendas de ETF e imposto pago (Renda Variável)</h2>
        {dados.vendas.length === 0 ? (
          <p>Nenhuma venda de ETF em {ano}. Na ficha Renda Variável, os meses ficam zerados.</p>
        ) : (
          <>
            <table>
              <thead>
                <tr><th>Mês</th><th className="num">Vendido</th><th className="num">Lucro / prejuízo</th><th className="num">Prejuízo compensado</th><th className="num">Imposto (15%)</th><th className="num">DARF {CODIGO_DARF}</th></tr>
              </thead>
              <tbody>
                {dados.vendas.map((m) => (
                  <tr key={m.mes}>
                    <td>{nomeMes(m.mes)}</td>
                    <td className="num">{formatarMoeda(m.totalVendido)}</td>
                    <td className="num">{m.resultado < 0 ? '−' : ''}{formatarMoeda(Math.abs(m.resultado))}</td>
                    <td className="num">{formatarMoeda(m.prejuizoCompensado)}</td>
                    <td className="num">{formatarMoeda(m.impostoDoMes)}</td>
                    <td className="num">{m.darf > 0 ? `${formatarMoeda(m.darf)} até ${formatarData(m.vencimento)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={5}>Total em DARF</td><td className="num">{formatarMoeda(totalDarf)}</td></tr></tfoot>
            </table>
            <p className="relatorio-nota">
              Prejuízo a compensar no ano seguinte: <b>{formatarMoeda(dados.vendas[dados.vendas.length - 1].prejuizoAcumulado)}</b>. Lance mês a mês em
              "Renda Variável → Operações comuns", em fundos de índice.
            </p>
          </>
        )}
      </section>

      <section>
        <h2>3. Movimentações de {ano}</h2>
        {dados.movs.length === 0 ? (
          <p>Nenhuma compra ou venda registrada em {ano}.</p>
        ) : (
          <table>
            <thead><tr><th>Data</th><th>Operação</th><th>Investimento</th><th className="num">Quantidade</th><th className="num">Preço</th><th className="num">Total</th></tr></thead>
            <tbody>
              {dados.movs.map((m) => (
                <tr key={m.id}>
                  <td>{formatarData(m.data)}</td>
                  <td>{m.tipo === 'compra' ? 'Compra' : 'Venda'}</td>
                  <td>{dados.porId.get(m.ativoId)?.nome ?? '—'}</td>
                  <td className="num">{qtd(m.quantidade)}</td>
                  <td className="num">{formatarMoeda(m.precoUnitario)}</td>
                  <td className="num">{formatarMoeda(Math.round(m.quantidade * m.precoUnitario))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="relatorio-nota">
        Renda fixa (Tesouro, CDB): o imposto já é retido pelo banco no resgate; os rendimentos exatos estão no informe de cada instituição.
        Este relatório usa só o que foi registrado no Investindo! e não substitui o informe de rendimentos nem um contador.
      </footer>
    </main>
  );
}
