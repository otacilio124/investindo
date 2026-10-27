import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AvisoErro, Campo, Carregando, ErroCarga, Logotipo, Selecao } from '../componentes/base';
import { carregarCarteira, criarAtivoProprio, registrarMovimentacao, salvarPerfil, useCarregar } from '../lib/dados';
import { formatarMoeda, hojeSP, lerMoeda } from '../lib/formato';
import { metaReserva } from '../domain/metas';
import { CARTEIRA_ALVO, NOME_CLASSE, type Classe, type TipoPerfil } from '../domain/tipos';

type Reacao = 'vender' | 'esperar' | 'comprar';

/** Prazo curto limita o risco, qualquer que seja a reação a quedas. */
export function sugerirPerfil(prazoAnos: number, reacao: Reacao): TipoPerfil {
  const pelaReacao: TipoPerfil = reacao === 'vender' ? 'conservador' : reacao === 'esperar' ? 'moderado' : 'arrojado';
  if (prazoAnos < 3) return 'conservador';
  if (prazoAnos < 5 && pelaReacao === 'arrojado') return 'moderado';
  return pelaReacao;
}

export default function PrimeiroAcesso() {
  const navegar = useNavigate();
  const carteira = useCarregar(null, carregarCarteira);
  const [gasto, setGasto] = useState('');
  const [meses, setMeses] = useState(6);
  const [prazo, setPrazo] = useState(10);
  const [reacao, setReacao] = useState<Reacao>('esperar');
  const [diaAporte, setDiaAporte] = useState(5);
  const [etfBr, setEtfBr] = useState('BOVA11');
  const [etfExt, setEtfExt] = useState('IVVB11');
  const [saldos, setSaldos] = useState<Record<Classe, string>>({ reserva: '', renda_fixa: '', acoes_br: '', exterior: '' });
  const [tocado, setTocado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  if (carteira.carregando && !carteira.dados) return <main className="centro-tela"><Carregando /></main>;
  if (!carteira.dados) return <main className="pagina"><ErroCarga mensagem={carteira.erro ?? ''} tentarDeNovo={carteira.recarregar} /></main>;
  const d = carteira.dados;

  const gastoCentavos = lerMoeda(gasto);
  const perfil = sugerirPerfil(prazo, reacao);
  const pesos = CARTEIRA_ALVO[perfil];
  const etfs = (classe: Classe) => d.ativos.filter((a) => a.tipo === 'etf' && a.classe === classe);
  const saldosValidos = Object.values(saldos).every((s) => s.trim() === '' || lerMoeda(s) !== null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setTocado(true);
    if (gastoCentavos === null || gastoCentavos <= 0 || !saldosValidos) return;
    setErro(null);
    setSalvando(true);
    try {
      // Saldos que a pessoa já tem entram como "saldo anterior" de cada classe.
      // Ficam pelo valor aplicado até ela atualizar com o extrato na Carteira.
      for (const [classe, texto] of Object.entries(saldos) as [Classe, string][]) {
        const valor = lerMoeda(texto);
        if (!valor || valor <= 0) continue;
        const ativoId = await criarAtivoProprio({
          codigo: `SALDO-ANTERIOR-${classe.toUpperCase()}`,
          nome: `Saldo anterior · ${NOME_CLASSE[classe]}`,
          classe, tipo: 'outro', indexador: 'nenhum', vencimento: null,
          isento_ir: false, liquidez_diaria: classe === 'reserva', emissor: null,
        });
        await registrarMovimentacao({ ativo_id: ativoId, tipo: 'compra', data: hojeSP(), quantidade: 1, preco_unitario: valor / 100, taxa_contratada: null });
      }
      await salvarPerfil({
        gasto_mensal: gastoCentavos! / 100,
        meses_reserva: meses,
        prazo_anos: prazo,
        tipo_perfil: perfil,
        pct_renda_fixa: pesos.renda_fixa,
        pct_acoes_br: pesos.acoes_br,
        pct_exterior: pesos.exterior,
        dia_aporte: diaAporte,
        etf_acoes_br: etfBr,
        etf_exterior: etfExt,
        onboarding_concluido: true,
        revisado_em: hojeSP(),
      });
      navegar('/', { replace: true });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  }

  return (
    <main className="pagina">
      <Logotipo largura={160} />
      <div className="pilha-curta">
        <h1 className="titulo">Vamos montar seu plano</h1>
        <p className="suave">Leva dois minutos. Tudo pode ser mudado depois em Ajustes.</p>
      </div>

      <form className="pilha" onSubmit={enviar} noValidate>
        <AvisoErro>{erro}</AvisoErro>

        <section className="cartao pilha">
          <h2 className="subtitulo">Reserva de emergência</h2>
          <Campo rotulo="Quanto você gasta por mês? (R$)" numerico value={gasto} onChange={(e) => setGasto(e.target.value)} placeholder="3.000,00"
            erro={tocado && (gastoCentavos === null || gastoCentavos <= 0) ? 'Digite um valor, por exemplo 3.000,00.' : null} />
          <Selecao rotulo="Quantos meses de gastos guardar?" value={meses} onChange={(e) => setMeses(Number(e.target.value))}
            ajuda="6 meses é o mais comum. Quem tem renda variável costuma guardar mais.">
            {[3, 4, 5, 6, 8, 10, 12].map((m) => <option key={m} value={m}>{m} meses</option>)}
          </Selecao>
          {gastoCentavos !== null && gastoCentavos > 0 && (
            <p className="corpo-pequeno">Sua reserva: <span className="valor-pequeno">{formatarMoeda(metaReserva(gastoCentavos, meses))}</span>. Até completar, todo aporte vai para ela.</p>
          )}
        </section>

        <section className="cartao pilha">
          <h2 className="subtitulo">Seu perfil</h2>
          <Selecao rotulo="Daqui a quanto tempo você pode precisar desse dinheiro?" value={prazo} onChange={(e) => setPrazo(Number(e.target.value))}>
            <option value={2}>Menos de 3 anos</option>
            <option value={4}>De 3 a 5 anos</option>
            <option value={10}>De 5 a 15 anos</option>
            <option value={20}>Mais de 15 anos</option>
          </Selecao>
          <fieldset className="pilha-curta" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="corpo-pequeno" style={{ fontWeight: 500, marginBottom: 8 }}>Se sua carteira caísse 15% em um mês, você…</legend>
            {([
              ['vender', 'Venderia para não perder mais'],
              ['esperar', 'Esperaria e seguiria o plano'],
              ['comprar', 'Aproveitaria para comprar mais'],
            ] as [Reacao, string][]).map(([v, texto]) => (
              <label key={v} style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
                <input type="radio" name="reacao" value={v} checked={reacao === v} onChange={() => setReacao(v)} style={{ width: 20, height: 20 }} />
                {texto}
              </label>
            ))}
          </fieldset>
          <div className="aviso aviso-info">
            Perfil <strong>{perfil}</strong>: {pesos.renda_fixa}% renda fixa, {pesos.acoes_br}% ações Brasil, {pesos.exterior}% exterior.
          </div>
        </section>

        <section className="cartao pilha">
          <h2 className="subtitulo">ETFs e dia do aporte</h2>
          <Selecao rotulo="ETF de ações Brasil" value={etfBr} onChange={(e) => setEtfBr(e.target.value)}>
            {etfs('acoes_br').map((a) => <option key={a.id} value={a.codigo}>{a.nome}</option>)}
          </Selecao>
          <Selecao rotulo="ETF do exterior em reais" value={etfExt} onChange={(e) => setEtfExt(e.target.value)}>
            {etfs('exterior').map((a) => <option key={a.id} value={a.codigo}>{a.nome}</option>)}
          </Selecao>
          <Selecao rotulo="Em que dia do mês você investe?" value={diaAporte} onChange={(e) => setDiaAporte(Number(e.target.value))} ajuda="Normalmente, logo depois do salário.">
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Dia {d}</option>)}
          </Selecao>
        </section>

        <section className="cartao pilha">
          <div className="pilha-curta">
            <h2 className="subtitulo">O que você já tem (opcional)</h2>
            <p className="corpo-pequeno suave">Some o que já está investido em cada classe. Depois, na Carteira, você detalha produto por produto.</p>
          </div>
          {(Object.keys(saldos) as Classe[]).map((c) => (
            <Campo key={c} rotulo={`${NOME_CLASSE[c]} (R$)`} numerico value={saldos[c]} placeholder="0,00"
              onChange={(e) => setSaldos({ ...saldos, [c]: e.target.value })}
              erro={tocado && saldos[c].trim() !== '' && lerMoeda(saldos[c]) === null ? 'Valor inválido.' : null} />
          ))}
        </section>

        <button className="botao botao-principal botao-largo" disabled={salvando}>{salvando ? 'Salvando…' : 'Começar a investir'}</button>
      </form>
    </main>
  );
}
