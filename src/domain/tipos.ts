/**
 * Tipos e constantes do domínio. Todo valor em dinheiro circula em CENTAVOS
 * inteiros dentro do domínio, para nunca somar centavos com erro de ponto
 * flutuante. A conversão para reais acontece só na borda (banco e tela).
 */

export type Centavos = number;

export type Classe = 'reserva' | 'renda_fixa' | 'acoes_br' | 'exterior';
export type ClasseInvestimento = Exclude<Classe, 'reserva'>;
export const CLASSES_INVESTIMENTO: ClasseInvestimento[] = ['renda_fixa', 'acoes_br', 'exterior'];

export type TipoPerfil = 'conservador' | 'moderado' | 'arrojado';

/** Percentuais-alvo padrão por perfil (o usuário pode editar). */
export const CARTEIRA_ALVO: Record<TipoPerfil, Record<ClasseInvestimento, number>> = {
  conservador: { renda_fixa: 70, acoes_br: 15, exterior: 15 },
  moderado: { renda_fixa: 50, acoes_br: 25, exterior: 25 },
  arrojado: { renda_fixa: 30, acoes_br: 35, exterior: 35 },
};

export const NOME_CLASSE: Record<Classe, string> = {
  reserva: 'Reserva de emergência',
  renda_fixa: 'Renda fixa longa',
  acoes_br: 'Ações Brasil',
  exterior: 'Exterior em reais',
};

/** Cor fixa de cada classe em todo o app (manual de marca, "Gráficos"). */
export const COR_CLASSE: Record<Classe, string> = {
  reserva: 'var(--tinta-suave)',
  renda_fixa: 'var(--floresta)',
  acoes_br: 'var(--verde)',
  exterior: 'var(--ouro)',
};

export type Indexador = 'pre' | 'cdi' | 'selic' | 'ipca' | 'nenhum';
export type TipoAtivo = 'etf' | 'tesouro' | 'cdb' | 'lci_lca' | 'outro';

export const reais = (centavos: Centavos): number => centavos / 100;
export const centavos = (reaisValor: number): Centavos => Math.round(reaisValor * 100);
