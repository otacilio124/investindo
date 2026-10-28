import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { direcao, formatarData, formatarVariacao } from '../lib/formato';
import type { Centavos } from '../domain/tipos';

/* ---------- Marca ---------- */

/**
 * `escuro` força a versão para fundo escuro (cabeçalho floresta). Sem ele, o
 * logotipo acompanha o tema do aparelho.
 */
export function Logotipo({ escuro = false, largura = 160 }: { escuro?: boolean; largura?: number }) {
  const altura = Math.round((largura * 64) / 481);
  if (escuro) return <img src="/marca/investindo-logotipo-escuro.svg" alt="Investindo!" width={largura} height={altura} />;
  return (
    <picture>
      <source srcSet="/marca/investindo-logotipo-escuro.svg" media="(prefers-color-scheme: dark)" />
      <img src="/marca/investindo-logotipo.svg" alt="Investindo!" width={largura} height={altura} />
    </picture>
  );
}

/* ---------- Cores para gráficos ---------- */

const TOKENS_GRAFICO = ['floresta', 'verde', 'ouro', 'negativo', 'tinta', 'tinta-suave', 'linha', 'superficie-elevada'] as const;
type CoresGrafico = Record<(typeof TOKENS_GRAFICO)[number], string>;

const lerCores = (): CoresGrafico => {
  const estilo = getComputedStyle(document.documentElement);
  return Object.fromEntries(TOKENS_GRAFICO.map((t) => [t, estilo.getPropertyValue(`--${t}`).trim()])) as CoresGrafico;
};

/**
 * Atributos SVG (fill, stroke) não aceitam var(--token): os gráficos recebem a
 * cor já resolvida, e ela muda junto com o tema do aparelho.
 */
export function useCoresGrafico(): CoresGrafico {
  const [cores, setCores] = useState(lerCores);
  useEffect(() => {
    const consulta = window.matchMedia('(prefers-color-scheme: dark)');
    const atualizar = () => setCores(lerCores());
    consulta.addEventListener('change', atualizar);
    return () => consulta.removeEventListener('change', atualizar);
  }, []);
  return cores;
}

/* ---------- Números ---------- */

/** ▲ +R$ 32,40 (+1,20%): nunca só a cor (manual, "Ganhos e perdas"). */
export function Variacao({ valor, percentual, className = '' }: { valor: Centavos; percentual: number; className?: string }) {
  const d = valor === 0 ? 'neutra' : direcao(percentual || valor);
  return <span className={`valor-pequeno ${d} ${className}`}>{formatarVariacao(valor, percentual)}</span>;
}

export function FonteDado({ fonte, data, desatualizado = false }: { fonte: string; data: string | null; desatualizado?: boolean }) {
  return (
    <p className="legenda">
      Fonte: {fonte} · {formatarData(data)}
      {desatualizado && <span className="etiqueta etiqueta-alerta" style={{ marginLeft: 8 }}>desatualizado</span>}
    </p>
  );
}

/* ---------- Formulários ---------- */

interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string;
  erro?: string | null;
  ajuda?: ReactNode;
  numerico?: boolean;
}

export function Campo({ rotulo, erro, ajuda, numerico, className, ...resto }: PropsCampo) {
  const id = useId();
  return (
    <div className="campo" data-erro={Boolean(erro)}>
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        className={`${numerico ? 'numero' : ''} ${className ?? ''}`}
        inputMode={numerico ? 'decimal' : resto.inputMode}
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}
        {...resto}
      />
      {erro ? <span id={`${id}-erro`} className="mensagem-erro">{erro}</span> : ajuda ? <span id={`${id}-ajuda`} className="ajuda">{ajuda}</span> : null}
    </div>
  );
}

interface PropsSelecao extends SelectHTMLAttributes<HTMLSelectElement> {
  rotulo: string;
  ajuda?: ReactNode;
  children: ReactNode;
}

export function Selecao({ rotulo, ajuda, children, ...resto }: PropsSelecao) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} {...resto}>{children}</select>
      {ajuda && <span className="ajuda">{ajuda}</span>}
    </div>
  );
}

export function AvisoErro({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="aviso aviso-erro" role="alert">{children}</div>;
}

/* ---------- Estados de carga ---------- */

/**
 * Símbolo da marca animado: as barras sobem uma depois da outra, como um
 * gráfico em alta, e o "!" dourado fecha o ciclo. Mesmo desenho do
 * investindo-simbolo.svg (o index.html tem uma cópia para a tela de abertura).
 */
export function SimboloAnimado({ tamanho = 56 }: { tamanho?: number }) {
  return (
    <svg className="simbolo-animado" viewBox="0 0 64 64" width={tamanho} height={tamanho} aria-hidden>
      <rect className="sa-fundo" width="64" height="64" rx="6" />
      <rect className="sa-barra sa-1" x="10" y="36" width="12" height="16" />
      <rect className="sa-barra sa-2" x="26" y="24" width="12" height="28" />
      <rect className="sa-barra sa-3" x="42" y="10" width="12" height="26" />
      <rect className="sa-barra sa-4" x="42" y="40" width="12" height="12" />
    </svg>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="carregador" role="status" aria-live="polite">
      <SimboloAnimado />
      <span className="carregador-texto">{texto}</span>
    </div>
  );
}

export function ErroCarga({ mensagem, tentarDeNovo }: { mensagem: string; tentarDeNovo: () => void }) {
  return (
    <div className="aviso aviso-erro pilha-curta" role="alert">
      <span>Não conseguimos carregar agora. {mensagem}</span>
      <button className="botao botao-secundario" onClick={tentarDeNovo}><RefreshCw size={20} className="icone" aria-hidden /> Tentar de novo</button>
    </div>
  );
}

/** Mostrado quando a rede falhou e a tela usa a última cópia salva no aparelho. */
export function AvisoCache({ salvoEm }: { salvoEm: string | null }) {
  if (!salvoEm) return null;
  const quando = new Date(salvoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <div className="aviso aviso-info" role="status" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <AlertTriangle size={20} className="icone" aria-hidden />
      Sem conexão. Mostrando os dados salvos em {quando}.
    </div>
  );
}

/* ---------- Reserva ---------- */

export function BarraReserva({ saldo, meta }: { saldo: Centavos; meta: Centavos }) {
  const pct = meta > 0 ? Math.min(100, (saldo / meta) * 100) : 0;
  const completa = meta > 0 && saldo >= meta;
  return (
    <div className="pilha-curta">
      <div className="barra-trilho" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Progresso da reserva de emergência">
        <div className="barra-preenchimento" data-completa={completa} style={{ width: `${pct}%` }} />
      </div>
      {completa && <span className="sobretitulo" style={{ color: 'var(--ouro)' }}>Reserva completa</span>}
    </div>
  );
}
