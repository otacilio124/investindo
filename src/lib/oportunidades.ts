import { useEffect, useMemo, useState } from 'react';
import { avaliarOportunidades, contextoDoAtivo, type ContextoAtivo, type Oportunidade } from '../domain/oportunidades';
import { NOME_CLASSE, type ClasseInvestimento } from '../domain/tipos';
import { resumoDaCarteira, type DadosCarteira } from './dados';
import { carregarCandles } from './mercado';

/**
 * Classes abaixo do alvo, com o contexto de preço dos ETFs escolhidos.
 * Sem histórico de preços (por exemplo, antes da primeira coleta), funciona só
 * com a distância até o alvo.
 */
export function useOportunidades(d: DadosCarteira | null): { oportunidades: Oportunidade[]; carregando: boolean } {
  const [contexto, setContexto] = useState<Partial<Record<ClasseInvestimento, ContextoAtivo>> | null>(null);

  useEffect(() => {
    if (!d) return;
    let vivo = true;
    const etfs: [ClasseInvestimento, string][] = [['acoes_br', d.perfil.etf_acoes_br], ['exterior', d.perfil.etf_exterior]];
    Promise.all(etfs.map(([classe, codigo]) =>
      carregarCandles(codigo, 0.3)
        .then((c) => [classe, contextoDoAtivo(codigo, c)] as const)
        .catch(() => [classe, { codigo, variacao30d: null, distanciaMedia50: null }] as const),
    )).then((pares) => vivo && setContexto(Object.fromEntries(pares)));
    return () => {
      vivo = false;
    };
  }, [d]);

  const oportunidades = useMemo(
    () => (d ? avaliarOportunidades(resumoDaCarteira(d).classes, contexto ?? {}, NOME_CLASSE) : []),
    [d, contexto],
  );
  return { oportunidades, carregando: Boolean(d) && contexto === null };
}
