import { useEffect, useMemo, useState } from 'react';
import { somarDias } from '../domain/calendario';
import type { PontoPatrimonio } from '../domain/carteira';
import type { PontoSerie } from '../domain/rendaFixa';
import { compararComReferencias, type Fluxo, type PontoPreco } from '../domain/simulacoes';
import type { DadosCarteira } from './dados';
import { hojeSP } from './formato';
import { carregarCandles } from './mercado';
import { supabase } from './supabase';

export async function carregarCdiDiario(desde: string): Promise<PontoSerie[]> {
  const { data, error } = await supabase
    .from('indicador_historico').select('data_referencia, valor')
    .eq('codigo', 'cdi_diario').gte('data_referencia', desde).order('data_referencia').limit(2000);
  if (error) throw new Error(error.message);
  return (data as { data_referencia: string; valor: number }[]).map((p) => ({ data: p.data_referencia, valor: Number(p.valor) }));
}

export async function carregarPrecos(codigo: string, anos: number): Promise<PontoPreco[]> {
  return (await carregarCandles(codigo, anos)).map((c) => ({ data: c.data, preco: c.fechamento }));
}

export interface Referencias {
  cdi: { data: string; valor: number }[];
  ibov: { data: string; valor: number }[];
  /** Resultado final de cada um, em % sobre o que entrou, para o resumo. */
  resumo: { carteira: number; cdi: number; ibov: number | null } | null;
}

/** CDI e Ibovespa com os mesmos aportes, nas mesmas datas, da carteira real. */
export function useReferencias(d: DadosCarteira | null, evolucao: PontoPatrimonio[] | null): Referencias | null {
  const [series, setSeries] = useState<{ cdi: PontoSerie[]; ibov: PontoPreco[] } | null>(null);

  useEffect(() => {
    if (!d || !evolucao || evolucao.length < 2) return;
    let vivo = true;
    const desde = somarDias(evolucao[0].data, -10);
    Promise.all([carregarCdiDiario(desde), carregarPrecos('IBOV', 2).catch(() => [])])
      .then(([cdi, ibov]) => vivo && setSeries({ cdi, ibov }))
      .catch(() => vivo && setSeries({ cdi: [], ibov: [] }));
    return () => {
      vivo = false;
    };
  }, [d, evolucao]);

  return useMemo(() => {
    if (!d || !evolucao || evolucao.length < 2 || !series) return null;
    const fluxos: Fluxo[] = d.movimentacoes.map((m) => ({
      data: m.data, valor: (m.tipo === 'compra' ? 1 : -1) * Math.round(m.quantidade * m.precoUnitario),
    }));
    const datas = evolucao.map((p) => p.data);
    const comp = compararComReferencias(fluxos, datas, series.cdi, series.ibov);
    const ultimo = evolucao[evolucao.length - 1];
    const ultimoComp = comp[comp.length - 1];
    const aplicado = ultimo.aplicado || 1;
    return {
      cdi: series.cdi.length ? comp.map((c) => ({ data: c.data, valor: c.cdi })) : [],
      ibov: comp.every((c) => c.ibov !== null) ? comp.map((c) => ({ data: c.data, valor: c.ibov! })) : [],
      resumo: {
        carteira: ((ultimo.valor - aplicado) / aplicado) * 100,
        cdi: ((ultimoComp.cdi - aplicado) / aplicado) * 100,
        ibov: ultimoComp.ibov === null ? null : ((ultimoComp.ibov - aplicado) / aplicado) * 100,
      },
    };
  }, [d, evolucao, series]);
}

/** Download de um lembrete mensal (.ics) que o calendário do celular entende. */
export function baixarLembreteMensal(dia: number): void {
  const hoje = hojeSP();
  const [a, m] = hoje.split('-').map(Number);
  const proximo = Number(hoje.slice(8, 10)) <= dia ? { a, m } : m === 12 ? { a: a + 1, m: 1 } : { a, m: m + 1 };
  const data = `${proximo.a}${String(proximo.m).padStart(2, '0')}${String(dia).padStart(2, '0')}`;
  const carimbo = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const linhas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Investindo!//Lembrete de aporte//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:aporte-mensal-${dia}@investindo.vercel.app`,
    `DTSTAMP:${carimbo}`,
    `DTSTART;VALUE=DATE:${data}`,
    `RRULE:FREQ=MONTHLY;BYMONTHDAY=${dia}`,
    'SUMMARY:Hora de investir (Investindo!)',
    `DESCRIPTION:Dia do seu aporte. Abra o app\\, veja o plano do mês e confirme as compras: ${window.location.origin}/investir`,
    `URL:${window.location.origin}/investir`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Hora de investir', 'TRIGGER:PT9H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const url = URL.createObjectURL(new Blob([linhas.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: 'lembrete-aporte-investindo.ics' });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
