# Investindo! — decisões de projeto

Este documento registra como o escopo original foi fechado antes do código: as
lacunas resolvidas, as fontes de dados escolhidas e o porquê de cada escolha.
Serve de anexo técnico para o trabalho acadêmico.

## 1. Contexto e escopo

- **Projeto acadêmico.** O app tem cadastro aberto com e-mail e senha porque o
  fluxo de contas (Resend + Supabase Auth) faz parte do que é avaliado. Por isso:
  aviso "não é recomendação de investimento" no cadastro, no rateio e nos
  e-mails; termos de uso e privacidade em `/termos`; exclusão de conta (LGPD).
- **A carteira fica na nuvem** (Supabase/Postgres). O aparelho guarda só uma
  cópia de leitura em cache, para o app abrir sem internet.
- **Cotações de ETF entraram no MVP**, junto com os preços do Tesouro, para a
  tela Carteira mostrar rendimento real.
- **Modo escuro entrou no MVP**: os tokens do manual já definem os dois temas,
  e o app segue a preferência do aparelho.

## 2. Algoritmo de rateio (lacunas resolvidas)

Implementação: `src/domain/rateio.ts`. Testes: `src/domain/rateio.test.ts`.

| Lacuna do escopo | Decisão |
| --- | --- |
| Reserva levava o aporte inteiro mesmo faltando pouco | A reserva recebe **só o que falta** para a meta; o resto segue para as classes no mesmo mês. |
| "Sobra vai para a renda fixa" × "acumula para o mês seguinte" | A sobra das cotas **vai para a renda fixa no mesmo mês**: o dinheiro não fica parado. A classe que não fechou uma cota continua abaixo do alvo e, pela própria regra das faltas, recebe mais no mês seguinte. Isso se corrige sozinho, sem guardar estado. |
| Valor menor que o mínimo do produto | Se a parte da renda fixa não atinge o mínimo do produto (Tesouro: 1% do título, nunca menos de R$ 30), ela fica como **caixa pendente** (`perfil.caixa_pendente`) e soma ao aporte do mês seguinte. |
| "Excedente segue os percentuais" | Matematicamente não acontece: a soma das faltas positivas é sempre ≥ ao aporte. O caso fica tratado só como proteção. |
| Arredondamento | Todo cálculo em **centavos inteiros**, divisão pelo método do maior resto: a soma das partes é sempre exatamente o aporte. |
| Sem cotação do ETF | O item aparece com o valor e sem quantidade, com o aviso "confira o preço no app da corretora". |
| Taxa de CDB não tem API pública | A pessoa digita um CDB prefixado de referência em Ajustes. Sem ele, o app compara só os títulos do Tesouro. |
| Comparação Tesouro IPCA+ × CDB | Os dois viram **retorno nominal líquido** anualizado no prazo da pessoa: IPCA esperado (Focus), taxa de custódia do Tesouro de 0,20% a.a. e alíquota regressiva do IR. Fica o maior. O título escolhido é o de vencimento mais próximo do prazo. |
| Juro real "Selic − inflação" | Equação de Fisher: (1 + Selic) ÷ (1 + inflação) − 1. O painel mostra o juro real passado (IPCA 12 meses) e o esperado (Focus). |

Os dois exemplos do escopo são testes automáticos: R$ 700 numa carteira de
R$ 3.000 dá R$ 0 / R$ 267,65 / R$ 432,35, que o escopo arredonda para 0 / 268 / 432.
Com a carteira zerada, dá 350 / 175 / 175.

Cada aporte salva em `aporte.regras` (jsonb) **tudo o que o cálculo usou**:
percentuais, saldos, preços, indicadores e os passos. Assim dá para responder
depois "por que o app sugeriu isso em março?".

## 3. Como o app sabe quanto vale a renda fixa

Pergunta do escopo: como mostrar o rendimento de CDB e Tesouro se não há uma API
do seu banco? O app usa **quatro métodos**, do mais para o menos confiável, e
sempre mostra qual usou e de quando é o dado (`src/domain/carteira.ts`):

1. **Preço de mercado.** Para o Tesouro, o preço de resgate (PU de venda) do
   CSV oficial do Tesouro Transparente. Para ETFs, a cotação do dia. É o valor
   real se você vendesse hoje.
2. **Saldo do extrato.** Você copia o saldo bruto do app do banco ("Atualizar
   pelo extrato"). O app corrige esse valor pela curva até hoje. É o método mais
   fiel para CDB, LCI e LCA.
3. **Curva calculada.** Com a taxa contratada e as séries do Banco Central:
   - % do CDI: multiplica a taxa de cada dia útil da série SGS 12;
   - prefixado: (1 + taxa)^(dias úteis ÷ 252), com o calendário de feriados nacionais;
   - IPCA + taxa: IPCA dos meses completos (SGS 433) × a parte real por dias úteis.
4. **Custo.** Sem nenhum dado, mostra o valor aplicado.

A tela também mostra o **IR estimado** se resgatasse hoje: tabela regressiva na
renda fixa, isenção para LCI/LCA e 15% sobre o ganho de ETFs.

## 4. Fontes de dados (todas gratuitas)

Implementação: `supabase/functions/_shared/fontes.ts`. Todas foram testadas
contra as APIs reais em 27/10/2026.

| Dado | Fonte principal | Reserva | Atualização |
| --- | --- | --- | --- |
| Selic meta | BCB SGS 432 | último valor salvo | 2× ao dia |
| CDI anual | BCB SGS 4389 | calculado do SGS 12 | 2× ao dia |
| CDI e Selic diários (curva) | BCB SGS 12 e 11 | — | 2× ao dia |
| IPCA do mês | BCB SGS 433 | IBGE SIDRA 1737 (v63) | 2× ao dia |
| IPCA 12 meses | BCB SGS 13522 | IBGE SIDRA 1737 (v2265) | 2× ao dia |
| Dólar | BCB Olinda PTAX | BCB SGS 1 | 2× ao dia |
| IPCA esperado | BCB Olinda Expectativas (Focus, mediana 12 meses) | IPCA 12 meses, com aviso | 2× ao dia |
| Tesouro Direto | CSV oficial do Tesouro Transparente | últimos preços salvos | 2× por dia útil |
| ETFs | brapi.dev (token gratuito) | Yahoo Finance | a cada 30 min no pregão |

Por que essas:

- **Banco Central e IBGE** são as fontes oficiais dos próprios índices. O IBGE é
  quem calcula o IPCA, então é a melhor reserva para o SGS.
- O **Focus** vem da API Olinda, não do SGS, como o escopo sugeria.
- **Tesouro Transparente** é a fonte oficial e não precisa de token.
- **brapi.dev** tem plano gratuito para B3. O Yahoo Finance é gratuito, mas não
  é oficial, por isso é só a reserva e passa pela checagem de salto abaixo.

## 5. Redundâncias de segurança

**No coletor**

- Cada dado tem uma cadeia de fontes, e a primeira resposta válida vence.
- Todo número passa por uma checagem de faixa plausível antes de ser gravado
  (por exemplo, Selic entre 0 e 50, dólar entre 1 e 30).
- Preço de ETF que salta mais de 25% só é aceito se a outra fonte confirmar o
  mesmo valor (diferença de até 2%).
- Cada busca tem tempo limite, 3 tentativas com espera crescente e nova
  tentativa quando o BCB devolve página de erro em vez de JSON.
- Se todas as fontes falharem, o **último valor é mantido** e marcado como
  `desatualizado`. O app nunca fica sem número e sempre mostra a data real do dado.
- O agendamento roda duas vezes: à noite e de novo de manhã. Cada execução fica
  registrada em `coleta_execucao`.
- O coletor só aceita chamadas com segredo próprio, comparado em tempo
  constante. O token da brapi nunca chega ao app.

**No app**

- Cache local da última carteira: sem internet, o app mostra os dados salvos e
  avisa de quando são.
- Indicador mais velho que a validade (5 dias; IPCA, 75 dias, porque sai no mês seguinte) ganha a etiqueta
  "desatualizado".
- Aporte confirmado numa única transação (`confirmar_aporte`): ou grava tudo,
  ou nada.

**No banco**

- RLS em todas as tabelas. Cada pessoa só lê e grava os próprios dados.
- Uma compra só aceita ativos do catálogo ou da própria pessoa.
- `CHECK` em valores, percentuais (somam 100), códigos de ETF e taxas.
- Dinheiro em `numeric`, nunca `float`.

## 6. Modelo de dados

```
auth.users ─┬─ perfil (1:1)       regras, reserva, ETFs, caixa pendente
            ├─ ativo (próprios)   CDB, LCI, saldos anteriores
            ├─ aporte ── aporte_item     sugestão + foto das regras
            ├─ movimentacao ──> ativo    compras e vendas/resgates
            ├─ saldo_extrato ──> ativo   saldo copiado do banco
            └─ meta                      metas de patrimônio

Públicas (só o coletor escreve):
  ativo (catálogo: ETFs + títulos do Tesouro)
  indicador (valor atual) · indicador_historico (séries diárias/mensais)
  preco_ativo (ETF e PU do Tesouro por dia) · coleta_execucao (log)
```

Mudanças em relação ao escopo:

- `compra` virou `movimentacao`, com `tipo` compra ou venda, porque resgatar a
  reserva é uma venda.
- Nova `taxa_contratada` em `movimentacao`, necessária para calcular a curva.
- Novas tabelas `saldo_extrato`, `aporte_item`, `indicador_historico`,
  `preco_ativo` e `coleta_execucao`.
- `usuario_id` em todas as tabelas da pessoa, ligado a `auth.users` com
  exclusão em cascata. Excluir a conta apaga tudo.
- A meta da reserva é calculada a partir do perfil (gasto × meses), não é uma
  linha de `meta`.

## 7. Conta e e-mails

- Senha com pelo menos 8 caracteres, letras e números. A regra vale no servidor
  (`config.toml`) e no app.
- No máximo 1 e-mail a cada 60 s por pessoa, no servidor e no botão.
- Os links dos e-mails usam `token_hash` → `/auth/confirmar`. Funcionam mesmo se
  o e-mail for aberto em outro aparelho, o que o fluxo PKCE não permite.
- A troca de e-mail exige confirmação nos dois endereços (`double_confirm_changes`).
- Os avisos de "senha alterada" e "e-mail alterado" são nativos do Supabase,
  com modelos da marca.
- Redefinir ou trocar a senha encerra as outras sessões.
- Excluir a conta pede a senha e a palavra EXCLUIR. A Edge Function
  `excluir-conta` apaga o usuário e envia a confirmação pelo Resend.
- **Envio em produção: SMTP do Gmail, no lugar do Resend.** O Resend só envia
  de um domínio verificado, e o projeto ainda não tem domínio próprio. O
  Supabase Auth usa o SMTP do Gmail (`noreply.investindo@gmail.com`, com senha
  de app), com limite de cerca de 500 e-mails por dia, o que basta para o uso
  acadêmico. Os modelos de e-mail e as regras não mudam. Para voltar ao Resend,
  basta registrar um domínio, verificá-lo (SPF e DKIM) e trocar o servidor SMTP
  no painel; o código não muda. Enquanto isso, a função `excluir-conta` apaga a
  conta normalmente, mas não envia o e-mail de confirmação (ele só sai com
  `RESEND_API_KEY` configurada).

## 8. Mercado, gráficos e notícias

- **Candles (OHLC diário):** Yahoo Finance, gratuito e sem token, para Ibovespa
  (^BVSP), dólar (BRL=X), S&P 500 (^GSPC) e os ETFs do catálogo. Na primeira
  coleta de cada código vêm 2 anos; depois, só os últimos 5 pregões. Candles
  incoerentes (máxima abaixo da mínima, preço zero) são descartados. Tabela
  `cotacao_diaria`.
- **Notícias:** RSS da Agência Brasil (licença CC BY), do g1 Economia e do
  InfoMoney. O app guarda só título, resumo curto (até 220 caracteres), imagem
  e link; a leitura acontece no site de cada veículo. Loterias saem do feed,
  links que não são `https` são recusados, e as notícias com mais de 30 dias
  são apagadas. Tabela `noticia`. Se uma fonte cair, as outras continuam.
- **Gráficos:** TradingView Lightweight Charts (Apache 2.0, com o logo de
  atribuição exigido pela licença) para candles, volume, médias móveis de 20 e
  50 pregões e evolução do patrimônio. Os minigráficos são SVG próprios, para a
  tela inicial não carregar a biblioteca inteira.
- **Animações:** Framer Motion, curtas (até 0,9 s) e sem piscar. Quem ativa
  "reduzir movimento" no aparelho vê tudo parado. A faixa de cotações para
  quando o mouse passa por cima.
- **Mudanças em relação ao manual de marca:** o manual pede "nada de degradê".
  O degradê aparece só no preenchimento das áreas dos gráficos e no brilho do
  carregamento. A grade fina no cabeçalho é um padrão de linhas, não um
  degradê decorativo.
- **Evolução do patrimônio:** cada pregão é avaliado com o fechamento daquele
  dia (`serieDePatrimonio`, testada).
- **Demonstração local:** `scripts/demo-local.sql` cria 12 meses de aportes na
  conta de teste local, com preços reais. Nunca rodar em produção.

## 9. Para quem nunca investiu

- **Boas-vindas:** 4 telas curtas, mostradas uma vez depois do questionário
  (`perfil.tutorial_visto_em`). Explicam o que o app faz, que ele nunca mexe no
  dinheiro e convidam para o curso.
- **Curso "Do zero ao primeiro aporte"** (`src/conteudo/curso.tsx`): 8 lições
  de 2 a 5 minutos, cada uma com um "Na prática" ligado ao app e um teste rápido.
  Acertar o teste marca a lição como concluída (`perfil.licoes_concluidas`), e o
  progresso vale em qualquer aparelho. A lição 1 tem um simulador de juros
  compostos que usa a mesma função das metas.
- **Glossário pesquisável** com 22 termos, mais o ícone ⓘ nos termos técnicos
  espalhados pelo app.
- **"Comece por aqui"** no Início: checklist que se marca sozinho a partir do
  que a pessoa fez (lições, primeiro aporte, reserva, meta). Some quando tudo
  está feito ou quando a pessoa esconde.
- O conteúdo é educativo, sem citar marcas de corretoras, e repete que o app
  não recomenda investimentos.

## 10. Aporte extra (e por que não há "dica de compra")

- **Pedido:** avisar quando uma ação cai e "compensa comprar". **Decisão:** não
  fazer recomendação baseada em queda de preço. Ela exigiria registro na CVM se
  oferecida a terceiros, não tem base estatística confiável e contraria o
  manual de marca ("comemoramos o hábito, não a sorte").
- **No lugar:** o **aporte extra**. A qualquer dia, a pessoa digita um valor e
  o app aplica o mesmo rateio do aporte mensal, priorizando o que está mais
  abaixo do alvo que ela própria definiu.
- **"Onde um aporte agora rende mais, pelas suas regras"**
  (`src/domain/oportunidades.ts`, testado): o **critério** é só a distância até
  o alvo. A queda do ETF em 30 dias e a distância até a média de 50 pregões
  aparecem como **contexto**, com a ressalva de que ninguém sabe se o preço vai
  subir ou cair. Classe acima do alvo nunca aparece, mesmo que tenha caído.
- O tipo do aporte (`mensal` ou `extra`) fica em `aporte.regras.tipo`, sem
  migração. Extras não contam como "o aporte do mês" no Início.

## 11. O que fica para depois

- **v2:** notificação push no dia do aporte (por enquanto há um aviso na tela
  Início), alertas por e-mail de desvio e de vencimento, e o simulador completo.
- **v3:** relatório anual de IR (a exportação CSV já existe), passkey e
  verificação em duas etapas.
- PNG do logotipo completo para os e-mails. Hoje o topo usa o símbolo em PNG
  com o nome em Arial Black, a reserva segura que o manual prevê.
