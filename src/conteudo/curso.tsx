import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { projetarPatrimonio } from '../domain/metas';
import { formatarMoeda } from '../lib/formato';

/**
 * Curso "Do zero ao primeiro aporte": lições curtas, sem jargão, para quem
 * nunca investiu. Conteúdo educativo, não é recomendação de investimento.
 */

export interface Pergunta {
  enunciado: string;
  opcoes: string[];
  correta: number;
  explicacao: string;
}

export interface Licao {
  id: string;
  titulo: string;
  resumo: string;
  minutos: number;
  conteudo: () => ReactNode;
  pergunta: Pergunta;
}

/* ------------------------------------------------------------------ */
/* Peças de texto reaproveitadas nas lições                            */
/* ------------------------------------------------------------------ */

function NaPratica({ children }: { children: ReactNode }) {
  return (
    <aside className="na-pratica">
      <b>Na prática</b>
      <div>{children}</div>
    </aside>
  );
}

function Comparacao({ itens }: { itens: [string, string][] }) {
  return (
    <dl className="comparacao">
      {itens.map(([t, d]) => (
        <div key={t}><dt>{t}</dt><dd>{d}</dd></div>
      ))}
    </dl>
  );
}

/** Lição 1: mexer nos números e ver o efeito dos juros compostos. */
function SimuladorJuros() {
  const [mensal, setMensal] = useState(300);
  const [anos, setAnos] = useState(10);
  const guardado = mensal * 100 * anos * 12;
  const investido = projetarPatrimonio(0, mensal * 100, anos, 4);
  const ganho = investido - guardado;
  return (
    <div className="simulador">
      <label>
        <span>Guardando por mês: <b>{formatarMoeda(mensal * 100)}</b></span>
        <input type="range" min={50} max={2000} step={50} value={mensal} onChange={(e) => setMensal(Number(e.target.value))} />
      </label>
      <label>
        <span>Durante: <b>{anos} {anos === 1 ? 'ano' : 'anos'}</b></span>
        <input type="range" min={1} max={30} value={anos} onChange={(e) => setAnos(Number(e.target.value))} />
      </label>
      <div className="simulador-resultado">
        <div><span>Só guardando, sem render</span><b>{formatarMoeda(guardado)}</b></div>
        <div><span>Rendendo 4% ao ano acima da inflação</span><b className="alta">{formatarMoeda(investido)}</b></div>
      </div>
      <p className="nota">
        A diferença de {formatarMoeda(ganho)} são os juros trabalhando para você. Valores de hoje, já descontada a inflação.
        É uma conta de exemplo, não uma promessa.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lições                                                              */
/* ------------------------------------------------------------------ */

export const CURSO: Licao[] = [
  {
    id: 'o-que-e-investir',
    titulo: 'O que é investir',
    resumo: 'Por que deixar o dinheiro parado faz você perder, e como os juros trabalham a seu favor.',
    minutos: 3,
    conteudo: () => (
      <>
        <p>
          Investir é emprestar ou aplicar seu dinheiro em algo que devolve mais do que você colocou. Em troca, alguém
          (o governo, um banco ou uma empresa) te paga pelo uso desse dinheiro.
        </p>
        <p>
          Dinheiro parado na conta corrente perde valor todo ano por causa da <b>inflação</b>, que é a alta dos preços.
          Se o pão custava R$ 1,00 e hoje custa R$ 1,05, seus R$ 100 compram menos pães do que antes. Investir é, antes
          de tudo, não deixar isso acontecer.
        </p>
        <h3>A mágica é o tempo</h3>
        <p>
          Os rendimentos de um mês passam a render também no mês seguinte. Isso se chama <b>juros compostos</b>. No começo
          parece pouco; depois de alguns anos, os juros chegam a render mais do que o que você guarda. Mexa nos números:
        </p>
        <SimuladorJuros />
        <NaPratica>
          Você não precisa de muito dinheiro para começar. Muita gente começa com R$ 100 por mês. O que mais pesa no
          resultado é a <b>constância</b>: investir todo mês, por anos.
        </NaPratica>
      </>
    ),
    pergunta: {
      enunciado: 'O que mais ajuda o seu dinheiro a crescer com o tempo?',
      opcoes: ['Acertar a ação que vai disparar', 'Investir um pouco todo mês, por bastante tempo', 'Deixar o dinheiro na conta corrente'],
      correta: 1,
      explicacao: 'Constância e tempo fazem os juros compostos trabalharem. Ninguém acerta o mercado sempre.',
    },
  },
  {
    id: 'reserva',
    titulo: 'Primeiro, a reserva de emergência',
    resumo: 'O colchão que evita vender investimentos na hora errada.',
    minutos: 3,
    conteudo: () => (
      <>
        <p>
          Antes de pensar em ações ou em render mais, você precisa de uma <b>reserva de emergência</b>: dinheiro guardado
          para imprevistos, como uma demissão, um conserto ou uma conta de saúde.
        </p>
        <h3>Quanto guardar</h3>
        <p>
          O comum é guardar de <b>3 a 6 meses dos seus gastos</b>. Quem tem renda que varia (autônomo, comissão) costuma
          guardar mais. O Investindo! calcula esse valor com o que você informou no questionário.
        </p>
        <h3>Onde guardar</h3>
        <p>A reserva precisa de três coisas: segurança, poder sacar no mesmo dia e render pelo menos a inflação. Bons lugares:</p>
        <Comparacao itens={[
          ['Tesouro Selic', 'Título do governo federal. É o investimento mais seguro do país e pode ser vendido em qualquer dia útil.'],
          ['CDB com liquidez diária', 'Empréstimo para um banco que você pode resgatar quando quiser. Procure os que pagam 100% do CDI ou mais.'],
        ]} />
        <p>
          Poupança também é segura, mas costuma render menos que essas duas opções.
        </p>
        <NaPratica>
          Enquanto a reserva não estiver completa, o Investindo! manda <b>todo o aporte</b> para ela. Só depois começa a
          dividir entre os outros investimentos.
        </NaPratica>
      </>
    ),
    pergunta: {
      enunciado: 'Para que serve a reserva de emergência?',
      opcoes: ['Para ter dinheiro rápido em um imprevisto, sem precisar vender outros investimentos', 'Para render o máximo possível', 'Para comprar ações quando caírem'],
      correta: 0,
      explicacao: 'A reserva é segurança. Com ela, uma emergência não te obriga a vender um investimento no prejuízo.',
    },
  },
  {
    id: 'renda-fixa',
    titulo: 'Renda fixa: Tesouro Direto e CDB',
    resumo: 'Você empresta dinheiro e já sabe como ele vai render.',
    minutos: 4,
    conteudo: () => (
      <>
        <p>
          Na <b>renda fixa</b>, você empresta dinheiro e a regra do rendimento é combinada na hora da compra. Por isso é
          a base da carteira de quase todo mundo.
        </p>
        <h3>Tesouro Direto: emprestar para o governo</h3>
        <Comparacao itens={[
          ['Tesouro Selic', 'Acompanha a taxa básica de juros. Ideal para a reserva.'],
          ['Tesouro IPCA+', 'Paga a inflação mais uma taxa fixa, como "IPCA + 6%". Protege seu poder de compra no longo prazo.'],
          ['Tesouro Prefixado', 'A taxa é fixa do começo ao fim, como 13% ao ano. Você sabe exatamente quanto terá no vencimento.'],
        ]} />
        <p>
          Dá para começar com cerca de R$ 30. Existe uma taxa de custódia pequena, de 0,20% ao ano, cobrada pela B3.
        </p>
        <h3>CDB: emprestar para um banco</h3>
        <p>
          O CDB costuma pagar um percentual do <b>CDI</b>, uma taxa que anda junto com a Selic. "110% do CDI" rende mais que
          "100% do CDI". CDBs são protegidos pelo <b>FGC</b>, um fundo que devolve até R$ 250 mil por pessoa, por banco, se o
          banco quebrar. LCI e LCA são parecidas e não pagam imposto de renda.
        </p>
        <NaPratica>
          Na parte de renda fixa, o Investindo! compara o Tesouro IPCA+ com um CDB prefixado que você informar e escolhe o
          que rende mais depois do imposto.
        </NaPratica>
      </>
    ),
    pergunta: {
      enunciado: 'Um título "IPCA + 6%" rende…',
      opcoes: ['6% ao ano, nada mais', 'A inflação do período mais 6% ao ano', 'O que a bolsa render'],
      correta: 1,
      explicacao: 'Você recebe a inflação (IPCA) e mais 6% ao ano por cima. Por isso ele protege o poder de compra.',
    },
  },
  {
    id: 'acoes-etfs',
    titulo: 'Ações e ETFs, sem susto',
    resumo: 'Ser sócio de empresas, de um jeito simples e diversificado.',
    minutos: 4,
    conteudo: () => (
      <>
        <p>
          Uma <b>ação</b> é um pedacinho de uma empresa. Quando a empresa cresce e lucra, a ação tende a valer mais. Mas o
          preço sobe e desce todo dia, às vezes bastante.
        </p>
        <p>
          Escolher empresas uma a uma dá trabalho e é arriscado. Por isso o Investindo! usa <b>ETFs</b>: um ETF é uma cesta
          que já vem com dezenas ou centenas de empresas dentro. Você compra uma cota e passa a ter um pouquinho de todas.
        </p>
        <Comparacao itens={[
          ['BOVA11', 'Cesta das maiores empresas da bolsa brasileira (o Ibovespa).'],
          ['IVVB11', 'Cesta das 500 maiores empresas dos Estados Unidos, comprada em reais.'],
        ]} />
        <h3>Sobe e desce faz parte</h3>
        <p>
          Em alguns meses a bolsa cai 5%, 10%, às vezes mais. Isso é normal. O dinheiro que vai para ações deve ser o que
          você não vai precisar nos próximos anos. Quem vende na queda transforma uma oscilação em prejuízo de verdade.
        </p>
        <NaPratica>
          Quando a bolsa cai, a parte de ações fica abaixo do alvo e o Investindo! coloca mais dinheiro nela no aporte
          seguinte. Na prática, você compra mais barato, sem precisar adivinhar nada.
        </NaPratica>
      </>
    ),
    pergunta: {
      enunciado: 'O que é um ETF como o BOVA11?',
      opcoes: ['Uma ação de uma única empresa', 'Uma cesta com várias empresas, comprada como se fosse uma ação só', 'Um título do governo'],
      correta: 1,
      explicacao: 'Com uma cota de ETF você tem um pouco de muitas empresas, o que reduz o risco de depender de uma só.',
    },
  },
  {
    id: 'risco-perfil',
    titulo: 'Risco, prazo e o seu perfil',
    resumo: 'Por que não colocar tudo num lugar só, e como o app divide o dinheiro.',
    minutos: 3,
    conteudo: () => (
      <>
        <p>
          Todo investimento tem algum risco. Quanto mais um investimento pode render, mais ele costuma oscilar. O jeito de
          dormir tranquilo é <b>diversificar</b>: espalhar o dinheiro em coisas que não sobem e caem juntas.
        </p>
        <h3>O seu perfil</h3>
        <Comparacao itens={[
          ['Conservador', '70% renda fixa, 15% ações Brasil, 15% exterior. Para quem não suporta ver quedas ou vai precisar do dinheiro logo.'],
          ['Moderado', '50% renda fixa, 25% ações Brasil, 25% exterior. Um equilíbrio para prazos médios e longos.'],
          ['Arrojado', '30% renda fixa, 35% ações Brasil, 35% exterior. Para prazos longos e quem aguenta oscilação.'],
        ]} />
        <p>
          Esses percentuais são a sua <b>carteira-alvo</b>. Todo mês, o app olha o que você já tem e coloca o aporte nas partes
          que estão abaixo do alvo. Assim a carteira volta ao equilíbrio sem você precisar vender nada.
        </p>
        <NaPratica>
          Você pode mudar o perfil e os percentuais em <Link to="/configuracoes">Ajustes</Link>. Vale revisar uma vez por ano
          ou quando sua vida mudar (casamento, filho, mudança de emprego).
        </NaPratica>
      </>
    ),
    pergunta: {
      enunciado: 'Se ações Brasil está abaixo do alvo, o que o app faz no próximo aporte?',
      opcoes: ['Vende a renda fixa', 'Coloca mais dinheiro em ações Brasil', 'Não faz nada'],
      correta: 1,
      explicacao: 'O aporte vai primeiro para o que está abaixo do alvo. A carteira se reequilibra sem vender nada.',
    },
  },
  {
    id: 'abrir-conta-comprar',
    titulo: 'Como abrir conta e comprar',
    resumo: 'O passo a passo para fazer a sua primeira compra no banco ou corretora.',
    minutos: 5,
    conteudo: () => (
      <>
        <p>
          O Investindo! diz <b>o que</b> comprar; a compra você faz no seu banco ou numa <b>corretora</b>, que é a empresa que
          dá acesso ao Tesouro Direto e à bolsa. O app nunca mexe no seu dinheiro.
        </p>
        <h3>1. Abra a conta</h3>
        <p>
          Abrir conta numa corretora é grátis e feito pelo celular, com documento com foto e CPF. Muitas corretoras e bancos
          digitais não cobram taxa para comprar Tesouro Direto e ETFs; confira antes de escolher.
        </p>
        <h3>2. Transfira o dinheiro</h3>
        <p>Faça um Pix da sua conta para a conta da corretora, no valor do aporte do mês.</p>
        <h3>3. Compre a renda fixa</h3>
        <p>
          Procure a área "Tesouro Direto" ou "Renda fixa", escolha o título que o Investindo! indicou (por exemplo
          "Tesouro IPCA+ 2035") e digite o valor.
        </p>
        <h3>4. Compre o ETF</h3>
        <p>
          Na área de bolsa (às vezes chamada de "home broker"), busque o código, como <b>BOVA11</b>. Escolha a quantidade de
          cotas que o app mostrou e envie a ordem. A bolsa funciona em dias úteis, das 10h às 17h.
        </p>
        <h3>5. Volte e confirme</h3>
        <p>
          No Investindo!, toque em <b>Confirmar compras</b> e ajuste o preço se tiver pagado diferente. Pronto: sua carteira e
          suas metas se atualizam sozinhas.
        </p>
        <NaPratica>
          Na primeira vez, comece pequeno, até com uma cota, só para aprender o caminho. Depois fica automático: o aporte do
          mês leva menos de dois minutos.
        </NaPratica>
      </>
    ),
    pergunta: {
      enunciado: 'Quem faz a compra dos investimentos?',
      opcoes: ['O Investindo!, automaticamente', 'Você, no seu banco ou corretora, seguindo a lista do app', 'O gerente do banco'],
      correta: 1,
      explicacao: 'O app calcula e organiza; a compra é sempre sua. Assim seu dinheiro nunca sai do seu controle.',
    },
  },
  {
    id: 'impostos',
    titulo: 'Impostos, sem complicação',
    resumo: 'Quanto de imposto existe e quando você precisa se preocupar.',
    minutos: 3,
    conteudo: () => (
      <>
        <p>Investimentos pagam imposto de renda <b>só sobre o lucro</b>, nunca sobre o que você colocou.</p>
        <h3>Renda fixa (Tesouro e CDB)</h3>
        <p>O imposto é descontado sozinho quando você resgata, e diminui quanto mais tempo o dinheiro fica aplicado:</p>
        <Comparacao itens={[
          ['Até 6 meses', '22,5% do lucro'],
          ['De 6 meses a 1 ano', '20%'],
          ['De 1 a 2 anos', '17,5%'],
          ['Mais de 2 anos', '15%'],
        ]} />
        <p>LCI e LCA não pagam imposto de renda.</p>
        <h3>ETFs</h3>
        <p>
          Só há imposto quando você <b>vende com lucro</b>: 15% do ganho, que você mesmo paga por um boleto do governo (DARF)
          até o fim do mês seguinte. Enquanto você só compra, não paga nada.
        </p>
        <h3>Declaração anual</h3>
        <p>
          Todo ano, os investimentos entram na declaração do imposto de renda. As corretoras enviam um informe pronto. Na
          Carteira, o botão <b>Exportar</b> gera a lista de todas as suas compras e vendas.
        </p>
      </>
    ),
    pergunta: {
      enunciado: 'Quando você paga imposto sobre um ETF?',
      opcoes: ['Todo mês, só por ter o ETF', 'Quando vende com lucro', 'Na hora da compra'],
      correta: 1,
      explicacao: 'Comprar e manter não gera imposto. Só a venda com lucro paga 15% sobre o ganho.',
    },
  },
  {
    id: 'rotina',
    titulo: 'Sua rotina com o Investindo!',
    resumo: 'Os dois minutos por mês que constroem o patrimônio.',
    minutos: 2,
    conteudo: () => (
      <>
        <ol className="rotina">
          <li><b>No dia do aporte</b>, abra o app e toque em <b>Investir</b>.</li>
          <li><b>Digite quanto vai investir.</b> O plano aparece na hora: o que comprar e por quê.</li>
          <li><b>Compre no seu banco ou corretora</b>, seguindo a lista.</li>
          <li><b>Volte e confirme.</b> A carteira, a reserva e as metas se atualizam.</li>
        </ol>
        <h3>O que não fazer</h3>
        <ul>
          <li>Não venda tudo quando a bolsa cair. Quedas fazem parte, e o app compra mais barato por você.</li>
          <li>Não acredite em promessas de ganho rápido ou "garantido". Isso não existe.</li>
          <li>Não pule a reserva. Ela é o que te deixa investir com calma.</li>
        </ul>
        <NaPratica>
          Pronto para começar? Se ainda não fez, siga o <Link to="/">"Comece por aqui"</Link> na tela inicial, ou vá direto para{' '}
          <Link to="/investir">Investir</Link>.
        </NaPratica>
      </>
    ),
    pergunta: {
      enunciado: 'A bolsa caiu 8% neste mês. O que o seu plano faz?',
      opcoes: ['Vende tudo para não perder mais', 'Segue o plano; o próximo aporte coloca mais onde ficou abaixo do alvo', 'Para de investir até subir'],
      correta: 1,
      explicacao: 'Seguir o plano é o que funciona no longo prazo. A queda vira oportunidade de comprar mais barato.',
    },
  },
];

export const MINUTOS_TOTAIS = CURSO.reduce((a, l) => a + l.minutos, 0);

/** Glossário em ordem alfabética, para consulta rápida. */
export const TERMOS: [string, string][] = [
  ['Aporte', 'Dinheiro novo que você coloca nos investimentos, normalmente todo mês.'],
  ['Ação', 'Um pedacinho de uma empresa negociado na bolsa.'],
  ['B3', 'A bolsa de valores do Brasil, onde ações e ETFs são negociados.'],
  ['CDB', 'Empréstimo que você faz a um banco, que te paga juros. Protegido pelo FGC.'],
  ['CDI', 'Taxa de juros entre bancos, quase igual à Selic. CDBs costumam render um percentual dela.'],
  ['Corretora', 'Empresa que dá acesso ao Tesouro Direto e à bolsa. É onde você faz as compras.'],
  ['Cota', 'A menor parte de um ETF ou fundo que você pode comprar.'],
  ['Diversificar', 'Espalhar o dinheiro em investimentos diferentes para não depender de um só.'],
  ['ETF', 'Cesta de várias ações (ou outros ativos) negociada na bolsa como se fosse uma ação só.'],
  ['FGC', 'Fundo Garantidor de Créditos: devolve até R$ 250 mil por pessoa, por banco, se o banco quebrar.'],
  ['Inflação (IPCA)', 'A alta geral dos preços. O IPCA é o índice oficial que mede isso no Brasil.'],
  ['Juros compostos', 'Quando os rendimentos passam a render também. É o que faz o dinheiro crescer com o tempo.'],
  ['Juro real', 'Quanto um investimento rende acima da inflação, o ganho de verdade no poder de compra.'],
  ['Liquidez', 'A facilidade de transformar o investimento em dinheiro. Liquidez diária: dá para sacar em qualquer dia útil.'],
  ['Rateio', 'A divisão do aporte entre os investimentos, feita pelo app seguindo as suas regras.'],
  ['Renda fixa', 'Investimentos em que a regra do rendimento é combinada na compra, como Tesouro e CDB.'],
  ['Renda variável', 'Investimentos cujo preço muda todo dia, como ações e ETFs.'],
  ['Reserva de emergência', 'Dinheiro guardado para imprevistos, seguro e disponível no mesmo dia.'],
  ['Selic', 'A taxa básica de juros do Brasil, definida pelo Banco Central a cada 45 dias.'],
  ['Tesouro Direto', 'Programa para comprar títulos do governo federal pela internet, a partir de cerca de R$ 30.'],
  ['Vencimento', 'A data em que um título de renda fixa termina e devolve o dinheiro com os juros.'],
  ['Volatilidade', 'O quanto um preço sobe e desce. Ações são mais voláteis que a renda fixa.'],
];
