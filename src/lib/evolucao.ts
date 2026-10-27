import { useEffect, useState } from 'react';
import { serieDePatrimonio, type PontoPatrimonio } from '../domain/carteira';
import type { DadosCarteira } from './dados';
import { carregarFechamentos } from './mercado';

/** Patrimônio dia a dia, avaliado com os fechamentos históricos. null enquanto carrega. */
export function useEvolucao(d: DadosCarteira | null, dias = 365): PontoPatrimonio[] | null {
  const [pontos, setPontos] = useState<PontoPatrimonio[] | null>(null);
  useEffect(() => {
    if (!d) return;
    let vivo = true;
    const ids = new Set(d.movimentacoes.map((m) => m.ativoId));
    const codigos = d.ativos.filter((a) => ids.has(a.id)).map((a) => a.codigo);
    carregarFechamentos(codigos, d.movimentacoes[0]?.data ?? d.hoje)
      .then((f) => vivo && setPontos(serieDePatrimonio(d.ativos, d.movimentacoes, d.extratos, f, d.mercado, d.hoje, dias)))
      .catch(() => vivo && setPontos([]));
    return () => {
      vivo = false;
    };
  }, [d, dias]);
  return pontos;
}
