import { Bell, BellOff, Download, LogOut } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AvisoErro, Campo, Carregando, ErroCarga, Selecao } from '../componentes/base';
import { CabecalhoPagina } from '../componentes/Estrutura';
import { Seguranca } from '../componentes/Seguranca';
import { validarPesos } from '../domain/rateio';
import { CARTEIRA_ALVO, type TipoPerfil } from '../domain/tipos';
import { carregarCarteira, limparCache, movimentacoesEmCSV, salvarPerfil, useCarregar, type PerfilRow } from '../lib/dados';
import { hojeSP, lerMoeda } from '../lib/formato';
import { desligarPush, enviarTeste, estadoPush, ligarPush, type EstadoPush } from '../lib/notificacoes';
import { useSessao } from '../lib/sessao';
import { mensagemDeErro, supabase, urlDoApp } from '../lib/supabase';
import { erroDeSenha } from './Autenticacao';

const numeroBR = (s: string) => Number(String(s).trim().replace(/\./g, '').replace(',', '.'));
const br = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

function Perfil({ perfil, etfs, aoSalvar }: { perfil: PerfilRow; etfs: { codigo: string; nome: string; classe: string }[]; aoSalvar: () => void }) {
  const [f, setF] = useState({
    tipo_perfil: perfil.tipo_perfil,
    pct_renda_fixa: br(perfil.pct_renda_fixa),
    pct_acoes_br: br(perfil.pct_acoes_br),
    pct_exterior: br(perfil.pct_exterior),
    gasto_mensal: br(perfil.gasto_mensal),
    meses_reserva: perfil.meses_reserva,
    prazo_anos: perfil.prazo_anos,
    dia_aporte: perfil.dia_aporte,
    etf_acoes_br: perfil.etf_acoes_br,
    etf_exterior: perfil.etf_exterior,
    produto_reserva: perfil.produto_reserva,
    cdb_pre_nome: perfil.cdb_pre_nome ?? '',
    cdb_pre_taxa: br(perfil.cdb_pre_taxa),
  });
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const pesos = { renda_fixa: numeroBR(f.pct_renda_fixa), acoes_br: numeroBR(f.pct_acoes_br), exterior: numeroBR(f.pct_exterior) };
  const erroPesos = validarPesos(pesos);

  function trocarPerfil(t: TipoPerfil) {
    const p = CARTEIRA_ALVO[t];
    setF({ ...f, tipo_perfil: t, pct_renda_fixa: String(p.renda_fixa), pct_acoes_br: String(p.acoes_br), pct_exterior: String(p.exterior) });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setOk(false);
    const gasto = lerMoeda(f.gasto_mensal);
    if (erroPesos) return setErro(erroPesos);
    if (gasto === null || gasto < 0) return setErro('Confira o gasto mensal.');
    const taxa = f.cdb_pre_taxa.trim() ? numeroBR(f.cdb_pre_taxa) : null;
    if (taxa !== null && !(taxa > 0 && taxa < 100)) return setErro('Confira a taxa do CDB.');
    setErro(null);
    setSalvando(true);
    try {
      await salvarPerfil({
        tipo_perfil: f.tipo_perfil, pct_renda_fixa: pesos.renda_fixa, pct_acoes_br: pesos.acoes_br, pct_exterior: pesos.exterior,
        gasto_mensal: gasto / 100, meses_reserva: f.meses_reserva, prazo_anos: f.prazo_anos, dia_aporte: f.dia_aporte,
        etf_acoes_br: f.etf_acoes_br, etf_exterior: f.etf_exterior, produto_reserva: f.produto_reserva.trim() || 'Tesouro Selic',
        cdb_pre_nome: f.cdb_pre_nome.trim() || null, cdb_pre_taxa: taxa, revisado_em: hojeSP(),
      });
      setOk(true);
      aoSalvar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="cartao pilha" onSubmit={salvar}>
      <h2 className="subtitulo">Perfil e regras do rateio</h2>
      <AvisoErro>{erro}</AvisoErro>
      {ok && <div className="aviso aviso-info" role="status">Regras salvas. O próximo rateio já usa os novos valores.</div>}
      <Selecao rotulo="Perfil" value={f.tipo_perfil} onChange={(e) => trocarPerfil(e.target.value as TipoPerfil)} ajuda="Trocar o perfil preenche os percentuais padrão.">
        <option value="conservador">Conservador</option>
        <option value="moderado">Moderado</option>
        <option value="arrojado">Arrojado</option>
      </Selecao>
      <div className="grade-cartoes">
        <Campo rotulo="Renda fixa (%)" numerico value={f.pct_renda_fixa} onChange={(e) => setF({ ...f, pct_renda_fixa: e.target.value })} />
        <Campo rotulo="Ações Brasil (%)" numerico value={f.pct_acoes_br} onChange={(e) => setF({ ...f, pct_acoes_br: e.target.value })} />
        <Campo rotulo="Exterior (%)" numerico value={f.pct_exterior} onChange={(e) => setF({ ...f, pct_exterior: e.target.value })} />
      </div>
      {erroPesos && <span className="corpo-pequeno queda">{erroPesos}</span>}
      <div className="grade-cartoes">
        <Campo rotulo="Gasto mensal (R$)" numerico value={f.gasto_mensal} onChange={(e) => setF({ ...f, gasto_mensal: e.target.value })} />
        <Selecao rotulo="Meses de reserva" value={f.meses_reserva} onChange={(e) => setF({ ...f, meses_reserva: Number(e.target.value) })}>
          {[3, 4, 5, 6, 8, 10, 12].map((m) => <option key={m} value={m}>{m} meses</option>)}
        </Selecao>
        <Campo rotulo="Prazo (anos)" type="number" min={1} max={50} value={f.prazo_anos} onChange={(e) => setF({ ...f, prazo_anos: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} />
        <Selecao rotulo="Dia do aporte" value={f.dia_aporte} onChange={(e) => setF({ ...f, dia_aporte: Number(e.target.value) })}>
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Dia {d}</option>)}
        </Selecao>
      </div>
      <div className="grade-cartoes">
        <Selecao rotulo="ETF ações Brasil" value={f.etf_acoes_br} onChange={(e) => setF({ ...f, etf_acoes_br: e.target.value })}>
          {etfs.filter((x) => x.classe === 'acoes_br').map((x) => <option key={x.codigo} value={x.codigo}>{x.nome}</option>)}
        </Selecao>
        <Selecao rotulo="ETF exterior" value={f.etf_exterior} onChange={(e) => setF({ ...f, etf_exterior: e.target.value })}>
          {etfs.filter((x) => x.classe === 'exterior').map((x) => <option key={x.codigo} value={x.codigo}>{x.nome}</option>)}
        </Selecao>
      </div>
      <Campo rotulo="Onde fica a reserva" value={f.produto_reserva} onChange={(e) => setF({ ...f, produto_reserva: e.target.value })} ajuda="Tesouro Selic ou um CDB de liquidez diária." maxLength={80} />
      <div className="grade-cartoes">
        <Campo rotulo="CDB prefixado para comparar (nome)" value={f.cdb_pre_nome} onChange={(e) => setF({ ...f, cdb_pre_nome: e.target.value })} placeholder="CDB Banco X 2030" maxLength={80} />
        <Campo rotulo="Taxa do CDB (% a.a.)" numerico value={f.cdb_pre_taxa} onChange={(e) => setF({ ...f, cdb_pre_taxa: e.target.value })}
          ajuda="Taxas de CDB não têm fonte pública: copie do app do seu banco." />
      </div>
      <button className="botao botao-principal botao-largo" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar regras'}</button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

const TEXTO_ESTADO: Record<EstadoPush, string> = {
  'sem-suporte': 'Este navegador não recebe notificações do app. Os avisos por e-mail funcionam em qualquer lugar.',
  'precisa-instalar': 'No iPhone, as notificações só funcionam com o app instalado: toque em Compartilhar → "Adicionar à Tela de Início" e abra por lá.',
  bloqueado: 'As notificações estão bloqueadas para este site. Libere nas configurações do navegador e volte aqui.',
  desligado: 'Desligadas neste aparelho.',
  ligado: 'Ligadas neste aparelho.',
};

function Avisos({ perfil, aoSalvar }: { perfil: PerfilRow; aoSalvar: () => void }) {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [email, setEmail] = useState(perfil.alerta_email);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    estadoPush().then(setEstado);
  }, []);

  const executar = async (acao: () => Promise<string | void>) => {
    setErro(null);
    setMensagem(null);
    setOcupado(true);
    try {
      const msg = await acao();
      if (msg) setMensagem(msg);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível agora.');
    } finally {
      setOcupado(false);
      setEstado(await estadoPush());
    }
  };

  return (
    <section className="cartao pilha-curta" aria-labelledby="titulo-avisos">
      <h2 className="subtitulo" id="titulo-avisos">Avisos</h2>
      <p className="corpo-pequeno suave">
        O Investindo! avisa no dia {perfil.dia_aporte} de cada mês, quando uma classe fica mais de 5 pontos longe do alvo e
        quando um título vence nos próximos 7 dias.
      </p>
      <AvisoErro>{erro}</AvisoErro>
      {mensagem && <div className="aviso aviso-info" role="status">{mensagem}</div>}

      <div className="pilha-curta">
        <span className="corpo-pequeno" style={{ fontWeight: 600 }}>Notificações no celular</span>
        <span className="corpo-pequeno suave" role="status">{estado ? TEXTO_ESTADO[estado] : 'Verificando…'}</span>
        {estado === 'desligado' && (
          <button className="botao botao-principal" disabled={ocupado} onClick={() => executar(async () => {
            await ligarPush();
            if (!perfil.alerta_push) await salvarPerfil({ alerta_push: true });
            return 'Pronto! Este aparelho vai receber os avisos.';
          })}>
            <Bell size={20} className="icone" aria-hidden /> Ligar notificações
          </button>
        )}
        {estado === 'ligado' && (
          <div style={{ display: 'grid', gap: 8 }}>
            <button className="botao botao-secundario" disabled={ocupado} onClick={() => executar(async () => {
              const n = await enviarTeste();
              return n ? 'Teste enviado. A notificação deve aparecer em instantes.' : 'Nenhum aparelho recebeu. Desligue e ligue de novo.';
            })}>
              Mandar um teste
            </button>
            <button className="botao botao-secundario" disabled={ocupado} onClick={() => executar(async () => { await desligarPush(); return 'Notificações desligadas neste aparelho.'; })}>
              <BellOff size={20} className="icone" aria-hidden /> Desligar neste aparelho
            </button>
          </div>
        )}
      </div>

      <label className="corpo-pequeno" style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
        <input type="checkbox" checked={email} disabled={ocupado} style={{ width: 20, height: 20, accentColor: 'var(--verde)' }}
          onChange={(e) => {
            const marcado = e.target.checked;
            setEmail(marcado);
            executar(async () => {
              await salvarPerfil({ alerta_email: marcado });
              aoSalvar();
              return marcado ? 'Você também vai receber os avisos por e-mail.' : 'Avisos por e-mail desligados.';
            });
          }} />
        Receber os avisos também por e-mail
      </label>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Conta({ email }: { email: string }) {
  const navegar = useNavigate();
  const [novoEmail, setNovoEmail] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [senhaExclusao, setSenhaExclusao] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const executar = async (acao: () => Promise<string | void>) => {
    setErro(null);
    setMensagem(null);
    setOcupado(true);
    try {
      const msg = await acao();
      if (msg) setMensagem(msg);
    } catch (e) {
      setErro(e instanceof Error && !('status' in e) ? e.message : mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  };

  /** Confirma a senha atual entrando de novo (renova a sessão e permite trocar a senha). */
  async function conferirSenha(senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error('A senha atual não confere.');
  }

  return (
    <section className="cartao pilha">
      <h2 className="subtitulo">Conta</h2>
      <p className="corpo-pequeno">Entrou como <strong>{email}</strong></p>
      <AvisoErro>{erro}</AvisoErro>
      {mensagem && <div className="aviso aviso-info" role="status">{mensagem}</div>}

      <form className="pilha-curta" onSubmit={(e) => { e.preventDefault(); executar(async () => {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novoEmail.trim())) throw new Error('Confira o novo e-mail.');
        const { error } = await supabase.auth.updateUser({ email: novoEmail.trim() }, { emailRedirectTo: urlDoApp('/configuracoes') });
        if (error) throw error;
        setNovoEmail('');
        return 'Enviamos um link para o novo e-mail e outro para o atual. A troca vale depois que você confirmar nos dois.';
      }); }}>
        <Campo rotulo="Trocar e-mail" type="email" autoComplete="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="novo@email.com" />
        <button className="botao botao-secundario" disabled={ocupado || !novoEmail}>Enviar confirmação</button>
      </form>

      <form className="pilha-curta" onSubmit={(e) => { e.preventDefault(); executar(async () => {
        const fraca = erroDeSenha(novaSenha);
        if (fraca) throw new Error(fraca);
        await conferirSenha(senhaAtual);
        const { error } = await supabase.auth.updateUser({ password: novaSenha });
        if (error) throw error;
        await supabase.auth.signOut({ scope: 'others' });
        setSenhaAtual('');
        setNovaSenha('');
        return 'Senha alterada. As outras sessões foram encerradas e enviamos um aviso para o seu e-mail.';
      }); }}>
        <span className="corpo-pequeno" style={{ fontWeight: 500 }}>Trocar senha</span>
        <Campo rotulo="Senha atual" type="password" autoComplete="current-password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} />
        <Campo rotulo="Nova senha" type="password" autoComplete="new-password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} ajuda="Pelo menos 8 caracteres, com letras e números." />
        <button className="botao botao-secundario" disabled={ocupado || !senhaAtual || !novaSenha}>Trocar senha</button>
      </form>

      <div style={{ display: 'grid', gap: 8 }}>
        <button className="botao botao-secundario" disabled={ocupado} onClick={() => executar(async () => { limparCache(); await supabase.auth.signOut(); navegar('/entrar'); })}>
          <LogOut size={20} className="icone" aria-hidden /> Sair
        </button>
        <button className="botao botao-secundario" disabled={ocupado} onClick={() => executar(async () => { limparCache(); await supabase.auth.signOut({ scope: 'global' }); navegar('/entrar'); })}>
          Sair de todos os aparelhos
        </button>
      </div>

      <details>
        <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', color: 'var(--negativo)', fontWeight: 600 }}>Excluir conta</summary>
        <form className="pilha-curta" onSubmit={(e) => { e.preventDefault(); executar(async () => {
          if (confirmacao.trim().toUpperCase() !== 'EXCLUIR') throw new Error('Digite EXCLUIR para confirmar.');
          await conferirSenha(senhaExclusao);
          const { error } = await supabase.functions.invoke('excluir-conta', { method: 'POST' });
          if (error) throw new Error('Não foi possível excluir a conta agora. Tente de novo em instantes.');
          limparCache();
          await supabase.auth.signOut({ scope: 'local' });
          navegar('/entrar', { replace: true });
        }); }}>
          <p className="corpo-pequeno">Apaga perfil, carteira, aportes e metas de forma definitiva. Não dá para desfazer.</p>
          <Campo rotulo="Sua senha" type="password" autoComplete="current-password" value={senhaExclusao} onChange={(e) => setSenhaExclusao(e.target.value)} />
          <Campo rotulo='Digite "EXCLUIR"' value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
          <button className="botao botao-perigo" disabled={ocupado}>Excluir minha conta</button>
        </form>
      </details>
    </section>
  );
}

/* ------------------------------------------------------------------ */

export default function Configuracoes() {
  const { sessao } = useSessao();
  const local = useLocation();
  const aviso = (local.state as { aviso?: string } | null)?.aviso;
  const r = useCarregar(null, carregarCarteira);
  useEffect(() => {
    window.history.replaceState({}, '');
  }, []);

  function exportar() {
    if (!r.dados) return;
    const url = URL.createObjectURL(new Blob([movimentacoesEmCSV(r.dados)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `investindo-movimentacoes-${hojeSP()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <CabecalhoPagina titulo="Ajustes" contexto="Regras do rateio e sua conta" />
      <div className="pagina">
        {aviso && <div className="aviso aviso-info" role="status">{aviso}</div>}
        {r.carregando && !r.dados && <Carregando />}
        {!r.carregando && !r.dados && <ErroCarga mensagem={r.erro ?? ''} tentarDeNovo={r.recarregar} />}
        {r.dados && (
          <Perfil
            perfil={r.dados.perfil}
            etfs={r.dados.ativos.filter((a) => a.tipo === 'etf').map((a) => ({ codigo: a.codigo, nome: a.nome, classe: a.classe }))}
            aoSalvar={r.recarregar}
          />
        )}
        {r.dados && <Avisos perfil={r.dados.perfil} aoSalvar={r.recarregar} />}
        {r.dados && (
          <section className="cartao pilha-curta">
            <h2 className="subtitulo">Seus dados</h2>
            <p className="corpo-pequeno suave">Todas as compras e vendas em CSV. Serve de base para a declaração do IR.</p>
            <button className="botao botao-secundario" onClick={exportar}><Download size={20} className="icone" aria-hidden /> Exportar movimentações</button>
            <Link to="/impostos" className="botao botao-secundario">Ajuda para o Imposto de Renda</Link>
          </section>
        )}
        {sessao?.user.email && <Seguranca />}
        {sessao?.user.email && <Conta email={sessao.user.email} />}
        <p className="legenda">Investindo! é um projeto acadêmico. Não é recomendação de investimento.</p>
      </div>
    </>
  );
}
