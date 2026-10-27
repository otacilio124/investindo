import type { Centavos, TipoPerfil } from './tipos';

export function metaReserva(gastoMensal: Centavos, meses: number): Centavos {
  return gastoMensal * meses;
}

/**
 * Juro real anual usado nas projeções, por perfil. É uma HIPÓTESE conservadora
 * para planejamento, não uma promessa de retorno (manual de marca, "Honestidade").
 */
export const JURO_REAL_PROJECAO: Record<TipoPerfil, number> = {
  conservador: 3,
  moderado: 4,
  arrojado: 5,
};

/**
 * Patrimônio projetado em valores de hoje: saldo atual mais aportes mensais
 * constantes, capitalizados pelo juro real mensal equivalente.
 */
export function projetarPatrimonio(
  saldoAtual: Centavos,
  aporteMensal: Centavos,
  anos: number,
  juroRealAnual: number,
): Centavos {
  const meses = Math.round(anos * 12);
  const r = Math.pow(1 + juroRealAnual / 100, 1 / 12) - 1;
  if (r === 0) return saldoAtual + aporteMensal * meses;
  const crescimento = Math.pow(1 + r, meses);
  return Math.round(saldoAtual * crescimento + aporteMensal * ((crescimento - 1) / r));
}
