import type { EmailOtpType } from '@supabase/supabase-js';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AvisoErro, Campo, Carregando, Logotipo } from '../componentes/base';
import { useSessao } from '../lib/sessao';
import { mensagemDeErro, supabase, urlDoApp } from '../lib/supabase';

/** Mesma regra do servidor (config.toml): 8+ caracteres, letras e números. */
export function erroDeSenha(s: string): string | null {
  if (s.length < 8) return 'Use pelo menos 8 caracteres.';
  if (!/\d/.test(s) || !/[a-zA-Z]/.test(s)) return 'Use letras e pelo menos um número.';
  return null;
}

const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

function TelaAuth({ titulo, children, rodape }: { titulo: string; children: ReactNode; rodape?: ReactNode }) {
  return (
    <main className="centro-tela">
      <div className="caixa-auth">
        <Logotipo largura={180} />
        <h1 className="titulo">{titulo}</h1>
        {children}
        {rodape && <div className="corpo-pequeno suave pilha-curta">{rodape}</div>}
      </div>
    </main>
  );
}

/** Contagem regressiva do botão de reenvio (60 s entre envios). */
function useEspera(segundos: number) {
  const [restante, setRestante] = useState(0);
  useEffect(() => {
    if (restante <= 0) return;
    const t = setTimeout(() => setRestante((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [restante]);
  return { restante, iniciar: () => setRestante(segundos) };
}

/* ------------------------------------------------------------------ */

export function Entrar() {
  const navegar = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [naoConfirmado, setNaoConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      setNaoConfirmado(/confirm/i.test(error.message));
      return;
    }
    navegar('/');
  }

  return (
    <TelaAuth
      titulo="Entrar"
      rodape={
        <>
          <Link to="/esqueci-senha">Esqueci minha senha</Link>
          <span>Ainda não tem conta? <Link to="/criar-conta">Criar conta</Link></span>
        </>
      }
    >
      <form className="pilha" onSubmit={enviar} noValidate>
        <AvisoErro>{erro}</AvisoErro>
        {naoConfirmado && <Link to="/verifique-email" state={{ email: email.trim() }}>Reenviar e-mail de confirmação</Link>}
        <Campo rotulo="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Campo rotulo="Senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        <button className="botao botao-principal botao-largo" disabled={enviando || !email || !senha}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </TelaAuth>
  );
}

/* ------------------------------------------------------------------ */

export function CriarConta() {
  const navegar = useNavigate();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [aceite, setAceite] = useState(false);
  const [tocado, setTocado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const erroSenha = tocado ? erroDeSenha(senha) : null;
  const erroEmail = tocado && !emailValido(email) ? 'Confira o e-mail.' : null;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setTocado(true);
    if (!nome.trim() || !emailValido(email) || erroDeSenha(senha) || !aceite) return;
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      options: { data: { nome: nome.trim(), aceite_termos: true }, emailRedirectTo: urlDoApp('/primeiro-acesso') },
    });
    setEnviando(false);
    if (error) return setErro(mensagemDeErro(error));
    // Mesma resposta exista a conta ou não: o Supabase não revela e-mails cadastrados.
    navegar('/verifique-email', { state: { email: email.trim() } });
  }

  return (
    <TelaAuth titulo="Criar conta" rodape={<span>Já tem conta? <Link to="/entrar">Entrar</Link></span>}>
      <form className="pilha" onSubmit={enviar} noValidate>
        <AvisoErro>{erro}</AvisoErro>
        <Campo rotulo="Nome" autoComplete="given-name" value={nome} onChange={(e) => setNome(e.target.value)} erro={tocado && !nome.trim() ? 'Diga como podemos te chamar.' : null} maxLength={120} />
        <Campo rotulo="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} erro={erroEmail} />
        <Campo rotulo="Senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} erro={erroSenha} ajuda="Pelo menos 8 caracteres, com letras e números." />
        <label className="corpo-pequeno" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minHeight: 44 }}>
          <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2 }} />
          <span>Li e aceito os <Link to="/termos" target="_blank">termos de uso e a política de privacidade</Link>.</span>
        </label>
        {tocado && !aceite && <span className="mensagem-erro corpo-pequeno queda">Aceite os termos para continuar.</span>}
        <button className="botao botao-principal botao-largo" disabled={enviando}>{enviando ? 'Criando…' : 'Criar conta'}</button>
      </form>
    </TelaAuth>
  );
}

/* ------------------------------------------------------------------ */

export function VerifiqueEmail() {
  const local = useLocation();
  const [email, setEmail] = useState<string>((local.state as { email?: string } | null)?.email ?? '');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const espera = useEspera(60);

  async function reenviar() {
    setErro(null);
    setMensagem(null);
    if (!emailValido(email)) return setErro('Confira o e-mail.');
    espera.iniciar();
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: urlDoApp('/primeiro-acesso') } });
    if (error && !/rate|security/i.test(error.message)) return setErro(mensagemDeErro(error));
    setMensagem('Se houver uma conta esperando confirmação com esse e-mail, o link chega em instantes.');
  }

  return (
    <TelaAuth titulo="Verifique seu e-mail" rodape={<Link to="/entrar">Voltar para entrar</Link>}>
      <p>Enviamos um link de confirmação{email ? <> para <strong>{email}</strong></> : ''}. Abra o link no celular para entrar direto no app.</p>
      <p className="corpo-pequeno suave">Não chegou? Olhe a caixa de spam ou peça outro link.</p>
      <AvisoErro>{erro}</AvisoErro>
      {mensagem && <div className="aviso aviso-info" role="status">{mensagem}</div>}
      {!(local.state as { email?: string } | null)?.email && (
        <Campo rotulo="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      )}
      <button className="botao botao-secundario botao-largo" onClick={reenviar} disabled={espera.restante > 0}>
        {espera.restante > 0 ? `Reenviar em ${espera.restante} s` : 'Reenviar confirmação'}
      </button>
    </TelaAuth>
  );
}

/* ------------------------------------------------------------------ */

export function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const espera = useEspera(60);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!emailValido(email)) return setErro('Confira o e-mail.');
    setErro(null);
    espera.iniciar();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: urlDoApp('/nova-senha') });
    // Resposta sempre igual, exista a conta ou não. Só erros de rede aparecem.
    if (error && /fetch|network/i.test(error.message)) return setErro(mensagemDeErro(error));
    setEnviado(true);
  }

  return (
    <TelaAuth titulo="Esqueci minha senha" rodape={<Link to="/entrar">Voltar para entrar</Link>}>
      {enviado && <div className="aviso aviso-info" role="status">Se houver uma conta com esse e-mail, o link chega em instantes. Ele vale por 1 hora.</div>}
      <form className="pilha" onSubmit={enviar} noValidate>
        <AvisoErro>{erro}</AvisoErro>
        <Campo rotulo="E-mail da conta" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="botao botao-principal botao-largo" disabled={espera.restante > 0}>
          {espera.restante > 0 ? `Enviar de novo em ${espera.restante} s` : 'Enviar link de redefinição'}
        </button>
      </form>
    </TelaAuth>
  );
}

/* ------------------------------------------------------------------ */

export function NovaSenha() {
  const navegar = useNavigate();
  const { sessao, carregando, limparRecuperacao } = useSessao();
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [tocado, setTocado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (carregando) return <main className="centro-tela"><Carregando /></main>;
  if (!sessao) {
    return (
      <TelaAuth titulo="Link expirado" rodape={<Link to="/entrar">Voltar para entrar</Link>}>
        <p>Este link de redefinição não vale mais. Links valem por 1 hora e só funcionam uma vez.</p>
        <Link className="botao botao-principal botao-largo" to="/esqueci-senha">Pedir um novo link</Link>
      </TelaAuth>
    );
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setTocado(true);
    if (erroDeSenha(senha) || senha !== repetir) return;
    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setEnviando(false);
      return setErro(mensagemDeErro(error));
    }
    // Encerra todas as outras sessões; o Supabase envia o aviso "sua senha foi alterada".
    await supabase.auth.signOut({ scope: 'others' });
    limparRecuperacao();
    navegar('/', { replace: true, state: { aviso: 'Senha alterada. As outras sessões foram encerradas.' } });
  }

  return (
    <TelaAuth titulo="Criar nova senha">
      <form className="pilha" onSubmit={enviar} noValidate>
        <AvisoErro>{erro}</AvisoErro>
        <Campo rotulo="Nova senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} erro={tocado ? erroDeSenha(senha) : null} ajuda="Pelo menos 8 caracteres, com letras e números." />
        <Campo rotulo="Repita a nova senha" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} erro={tocado && senha !== repetir ? 'As senhas não são iguais.' : null} />
        <button className="botao botao-principal botao-largo" disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar nova senha'}</button>
      </form>
    </TelaAuth>
  );
}

/* ------------------------------------------------------------------ */

const DESTINO: Record<string, string> = {
  signup: '/primeiro-acesso',
  email: '/primeiro-acesso',
  recovery: '/nova-senha',
  email_change: '/configuracoes',
  invite: '/primeiro-acesso',
};

/**
 * Destino dos links dos e-mails (token_hash): funciona mesmo se a pessoa abrir
 * o e-mail em outro aparelho, diferente do fluxo PKCE.
 */
export function ConfirmarLink() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const tokenHash = params.get('token_hash');
    const tipo = params.get('type') as EmailOtpType | null;
    if (!tokenHash || !tipo) {
      setErro('Link incompleto.');
      return;
    }
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo }).then(({ error }) => {
      if (error) return setErro('Este link não vale mais. Links valem por 1 hora e só funcionam uma vez.');
      const aviso = tipo === 'email_change' ? 'E-mail confirmado.' : undefined;
      navegar(DESTINO[tipo] ?? '/', { replace: true, state: aviso ? { aviso } : undefined });
    });
  }, [params, navegar]);

  if (!erro) return <main className="centro-tela"><Carregando texto="Confirmando…" /></main>;
  return (
    <TelaAuth titulo="Link inválido" rodape={<Link to="/entrar">Voltar para entrar</Link>}>
      <p>{erro}</p>
      <Link className="botao botao-secundario botao-largo" to="/verifique-email">Pedir outro link de confirmação</Link>
      <Link className="botao botao-secundario botao-largo" to="/esqueci-senha">Pedir outro link de senha</Link>
    </TelaAuth>
  );
}

/* ------------------------------------------------------------------ */

export function Termos() {
  return (
    <main className="pagina">
      <Logotipo largura={160} />
      <h1 className="titulo">Termos de uso e privacidade</h1>
      <section className="pilha-curta">
        <h2 className="subtitulo">Projeto acadêmico</h2>
        <p>O Investindo! é um trabalho de faculdade. Ele aplica regras que você mesmo define para dividir o seu aporte. <strong>Não é recomendação de investimento</strong>, não é consultoria e não tem registro na CVM. As decisões e as compras são suas, feitas no app do seu banco ou corretora.</p>
        <p>O app não executa ordens, não acessa sua conta bancária e não promete retorno. Investimentos podem perder valor.</p>
      </section>
      <section className="pilha-curta">
        <h2 className="subtitulo">Dados que guardamos</h2>
        <p>Nome, e-mail, perfil, percentuais-alvo, compras e saldos que você registra, e metas. Nunca pedimos nem guardamos senha de banco ou corretora. Sua senha do Investindo! fica só no Supabase Auth, com hash: nem o app a vê.</p>
        <p>Cada pessoa só enxerga os próprios dados (Row Level Security em todas as tabelas). Os indicadores vêm de fontes públicas: Banco Central, IBGE, Tesouro Transparente, brapi.dev e Yahoo Finance.</p>
      </section>
      <section className="pilha-curta">
        <h2 className="subtitulo">Seus direitos (LGPD)</h2>
        <p>Você pode exportar suas movimentações em CSV e excluir a conta a qualquer momento em Ajustes. A exclusão apaga perfil, carteira, aportes e metas de forma definitiva.</p>
      </section>
    </main>
  );
}
