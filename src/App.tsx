import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Carregando, Logotipo } from './componentes/base';
import { LayoutApp } from './componentes/Estrutura';
import { carregarPerfil } from './lib/dados';
import { ProvedorSessao, useSessao } from './lib/sessao';
import { apontaParaLocal, configurado } from './lib/supabase';
import { ConfirmarLink, CriarConta, Entrar, EsqueciSenha, NovaSenha, Termos, VerificarCodigo, VerifiqueEmail } from './paginas/Autenticacao';
import Configuracoes from './paginas/Configuracoes';
import Inicio from './paginas/Inicio';
import Investir from './paginas/Investir';
import PrimeiroAcesso from './paginas/PrimeiroAcesso';
import { Aprender, LicaoPagina } from './paginas/Aprender';
import Impostos from './paginas/Impostos';

// Telas com gráficos carregam o Recharts só quando abertas.
const Carteira = lazy(() => import('./paginas/Carteira'));
const Metas = lazy(() => import('./paginas/Metas'));
const Mercado = lazy(() => import('./paginas/Mercado'));
const RelatorioIR = lazy(() => import('./paginas/RelatorioIR'));
const comGrafico = (tela: ReactNode) => <Suspense fallback={<main className="pagina"><Carregando /></main>}>{tela}</Suspense>;

const telaCheia = (conteudo: ReactNode) => <main className="centro-tela">{conteudo}</main>;

/** Só entra quem tem sessão; quem não fez o questionário vai para o primeiro acesso. */
function Protegida({ children, exigeOnboarding = true }: { children: ReactNode; exigeOnboarding?: boolean }) {
  const { sessao, carregando, recuperandoSenha, faltaSegundaEtapa } = useSessao();
  const local = useLocation();
  const [onboarding, setOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (!sessao) return;
    carregarPerfil()
      .then((p) => setOnboarding(p.onboarding_concluido))
      .catch(() => setOnboarding(true)); // offline: deixa as telas abrirem com o cache
  }, [sessao, local.pathname]);

  if (carregando) return telaCheia(<Carregando />);
  if (!sessao) return <Navigate to="/entrar" replace state={{ de: local.pathname }} />;
  if (recuperandoSenha) return <Navigate to="/nova-senha" replace />;
  if (faltaSegundaEtapa) return <Navigate to="/verificar" replace state={{ de: local.pathname }} />;
  if (onboarding === null) return telaCheia(<Carregando />);
  if (exigeOnboarding && !onboarding) return <Navigate to="/primeiro-acesso" replace />;
  if (!exigeOnboarding && onboarding) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Telas de quem ainda não entrou: com sessão, vai direto para o app. */
function Publica({ children }: { children: ReactNode }) {
  const { sessao, carregando, faltaSegundaEtapa } = useSessao();
  if (carregando) return telaCheia(<Carregando />);
  if (sessao) return <Navigate to={faltaSegundaEtapa ? '/verificar' : '/'} replace />;
  return <>{children}</>;
}

function NaoConfigurado() {
  return telaCheia(
    <div className="caixa-auth">
      <Logotipo largura={180} />
      <h1 className="titulo">Falta configurar</h1>
      {apontaParaLocal ? (
        <p>
          Este site foi publicado apontando para o Supabase local (<code>127.0.0.1</code>), que só existe no computador de quem
          desenvolve. Na hospedagem, configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> com os dados do
          projeto de produção e publique de novo.
        </p>
      ) : (
        <p>Copie <code>.env.example</code> para <code>.env.local</code> e preencha a URL e a chave anon do Supabase. Os passos estão no README.</p>
      )}
    </div>,
  );
}

export default function App() {
  if (!configurado) return <NaoConfigurado />;
  return (
    <ProvedorSessao>
      <BrowserRouter>
        <Routes>
          <Route path="/entrar" element={<Publica><Entrar /></Publica>} />
          <Route path="/criar-conta" element={<Publica><CriarConta /></Publica>} />
          <Route path="/verifique-email" element={<Publica><VerifiqueEmail /></Publica>} />
          <Route path="/esqueci-senha" element={<Publica><EsqueciSenha /></Publica>} />
          <Route path="/nova-senha" element={<NovaSenha />} />
          <Route path="/auth/confirmar" element={<ConfirmarLink />} />
          <Route path="/termos" element={<Termos />} />
          <Route path="/verificar" element={<VerificarCodigo />} />
          <Route path="/primeiro-acesso" element={<Protegida exigeOnboarding={false}><PrimeiroAcesso /></Protegida>} />
          <Route path="/impostos/relatorio" element={<Protegida>{comGrafico(<RelatorioIR />)}</Protegida>} />
          <Route element={<Protegida><LayoutApp /></Protegida>}>
            <Route path="/" element={<Inicio />} />
            <Route path="/mercado" element={comGrafico(<Mercado />)} />
            <Route path="/investir" element={<Investir />} />
            <Route path="/carteira" element={comGrafico(<Carteira />)} />
            <Route path="/metas" element={comGrafico(<Metas />)} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/impostos" element={<Impostos />} />
            <Route path="/aprender" element={<Aprender />} />
            <Route path="/aprender/:id" element={<LicaoPagina />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ProvedorSessao>
  );
}
