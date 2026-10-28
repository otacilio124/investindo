/**
 * Calendário econômico: eventos que mexem com juros e inflação.
 *
 * Copom 2026: calendário divulgado pelo Banco Central (a decisão sai no segundo
 * dia, após as 18h). IPCA: divulgado pelo IBGE por volta do dia 10 do mês
 * seguinte; as datas marcadas como "previsao" seguem o calendário do INPC, que
 * sai no mesmo dia. Atualize esta lista quando o BC e o IBGE publicarem 2027.
 */

export interface EventoEconomico {
  data: string; // dia em que sai a notícia
  tipo: 'copom' | 'ipca';
  titulo: string;
  explicacao: string;
  previsao?: boolean;
  fonte: string;
}

const COPOM = 'Reunião do Copom';
const explicacaoCopom =
  'O Banco Central decide a Selic. Se ela sobe, Tesouro Selic, CDB e a renda fixa nova passam a render mais; se cai, rendem menos.';
const explicacaoIpca =
  'O IBGE divulga a inflação do mês. Ela corrige o Tesouro IPCA+ e mostra se o seu dinheiro está ganhando dos preços.';
const BCB = 'https://www.bcb.gov.br/controleinflacao/calendarioreunioescopom';
const IBGE = 'https://www.ibge.gov.br/calendario-indicadores-novoportal.html';

export const EVENTOS: EventoEconomico[] = [
  { data: '2026-01-28', tipo: 'copom', titulo: COPOM, explicacao: explicacaoCopom, fonte: BCB },
  { data: '2026-03-18', tipo: 'copom', titulo: COPOM, explicacao: explicacaoCopom, fonte: BCB },
  { data: '2026-04-29', tipo: 'copom', titulo: COPOM, explicacao: explicacaoCopom, fonte: BCB },
  { data: '2026-06-17', tipo: 'copom', titulo: COPOM, explicacao: explicacaoCopom, fonte: BCB },
  { data: '2026-07-10', tipo: 'ipca', titulo: 'Inflação de junho (IPCA)', explicacao: explicacaoIpca, fonte: IBGE },
  { data: '2026-08-05', tipo: 'copom', titulo: COPOM, explicacao: explicacaoCopom, fonte: BCB },
  { data: '2026-08-11', tipo: 'ipca', titulo: 'Inflação de julho (IPCA)', explicacao: explicacaoIpca, fonte: IBGE },
  { data: '2026-09-16', tipo: 'copom', titulo: COPOM, explicacao: explicacaoCopom, fonte: BCB },
  { data: '2026-11-04', tipo: 'copom', titulo: COPOM, explicacao: explicacaoCopom, fonte: BCB },
  { data: '2026-11-12', tipo: 'ipca', titulo: 'Inflação de outubro (IPCA)', explicacao: explicacaoIpca, previsao: true, fonte: IBGE },
  { data: '2026-12-09', tipo: 'copom', titulo: COPOM, explicacao: explicacaoCopom, fonte: BCB },
  { data: '2026-12-11', tipo: 'ipca', titulo: 'Inflação de novembro (IPCA)', explicacao: explicacaoIpca, previsao: true, fonte: IBGE },
];

export function proximosEventos(hoje: string, quantidade = 3): EventoEconomico[] {
  return EVENTOS.filter((e) => e.data >= hoje).sort((a, b) => a.data.localeCompare(b.data)).slice(0, quantidade);
}
