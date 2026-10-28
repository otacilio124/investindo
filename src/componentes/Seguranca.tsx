import type { Factor, PasskeyListItem } from '@supabase/supabase-js';
import { Fingerprint, ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { mensagemDeErro, supabase } from '../lib/supabase';
import { AvisoErro, Campo } from './base';

/**
 * Fase 3 do escopo: passkey (entrar com Face ID, digital ou PIN do aparelho) e
 * verificação em duas etapas com app autenticador. As duas ficam no Supabase
 * Auth; o banco exige o código para quem ativou (migração duas_etapas).
 */
export function Seguranca() {
  const [fatores, setFatores] = useState<Factor[] | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyListItem[] | null>(null);
  const [cadastro, setCadastro] = useState<{ id: string; qr: string; segredo: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const suportaPasskey = typeof window !== 'undefined' && 'PublicKeyCredential' in window;

  const recarregar = useCallback(async () => {
    const [{ data: f }, p] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.passkey.list().catch(() => ({ data: null })),
    ]);
    setFatores(f?.totp ?? []);
    setPasskeys(p.data ?? []);
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

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
      recarregar();
    }
  };

  const totp = fatores?.find((f) => f.status === 'verified');

  async function iniciarDuasEtapas() {
    await executar(async () => {
      // Um cadastro anterior abandonado no meio fica "unverified": limpa antes.
      for (const f of fatores ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Investindo!', issuer: 'Investindo!' });
      if (error) throw error;
      setCadastro({ id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret });
    });
  }

  async function confirmarDuasEtapas(e: FormEvent) {
    e.preventDefault();
    if (!cadastro) return;
    await executar(async () => {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: cadastro.id, code: codigo.replace(/\D/g, '') });
      if (error) throw new Error('Código errado ou vencido. Digite o código que está aparecendo agora no app.');
      setCadastro(null);
      setCodigo('');
      return 'Verificação em duas etapas ativada. Na próxima vez que entrar com a senha, o app vai pedir o código.';
    });
  }

  return (
    <section className="cartao pilha-curta" aria-labelledby="titulo-seguranca">
      <h2 className="subtitulo" id="titulo-seguranca">Segurança</h2>
      <AvisoErro>{erro}</AvisoErro>
      {mensagem && <div className="aviso aviso-info" role="status">{mensagem}</div>}

      <div className="pilha-curta">
        <span className="corpo-pequeno" style={{ fontWeight: 600 }}>Passkey</span>
        <p className="corpo-pequeno suave" style={{ margin: 0 }}>
          Entre sem digitar senha, com Face ID, digital ou o PIN do aparelho. A passkey fica guardada no aparelho (ou no iCloud / Google) e não pode ser roubada por um site falso.
        </p>
        {passkeys && passkeys.length > 0 && (
          <ul className="linhas">
            {passkeys.map((p) => (
              <li key={p.id} style={{ gridTemplateColumns: '1fr auto' }}>
                <span className="corpo-pequeno">
                  <Fingerprint size={16} aria-hidden style={{ verticalAlign: -3, marginRight: 6 }} />
                  {p.friendly_name || 'Passkey'}
                  <small className="suave" style={{ display: 'block' }}>
                    criada em {new Date(p.created_at).toLocaleDateString('pt-BR')}
                    {p.last_used_at && ` · usada em ${new Date(p.last_used_at).toLocaleDateString('pt-BR')}`}
                  </small>
                </span>
                <button className="botao botao-secundario" aria-label={`Apagar ${p.friendly_name || 'passkey'}`} disabled={ocupado}
                  onClick={() => executar(async () => {
                    const { error } = await supabase.auth.passkey.delete({ passkeyId: p.id });
                    if (error) throw error;
                    return 'Passkey apagada. Ela não entra mais na sua conta.';
                  })}>
                  <Trash2 size={18} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {suportaPasskey ? (
          <button className="botao botao-secundario" disabled={ocupado} onClick={() => executar(async () => {
            const { error } = await supabase.auth.registerPasskey();
            if (error) {
              if (/abort|cancel|NotAllowed/i.test(`${error.name} ${error.message}`)) return;
              throw error;
            }
            return 'Passkey criada. Da próxima vez, toque em "Entrar com passkey".';
          })}>
            <Fingerprint size={20} className="icone" aria-hidden /> Criar passkey neste aparelho
          </button>
        ) : (
          <p className="corpo-pequeno suave" style={{ margin: 0 }}>Este navegador não aceita passkeys.</p>
        )}
      </div>

      <div className="pilha-curta">
        <span className="corpo-pequeno" style={{ fontWeight: 600 }}>Verificação em duas etapas</span>
        {totp ? (
          <>
            <p className="corpo-pequeno" style={{ margin: 0 }}>
              <ShieldCheck size={16} aria-hidden style={{ verticalAlign: -3, marginRight: 6, color: 'var(--verde)' }} />
              Ativada. Ao entrar com a senha, o app pede o código do autenticador.
            </p>
            <button className="botao botao-secundario" disabled={ocupado} onClick={() => executar(async () => {
              const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id });
              if (error) throw error;
              await supabase.auth.refreshSession();
              return 'Verificação em duas etapas desativada.';
            })}>
              Desativar
            </button>
          </>
        ) : cadastro ? (
          <form className="pilha-curta" onSubmit={confirmarDuasEtapas}>
            <p className="corpo-pequeno" style={{ margin: 0 }}>
              1. No app autenticador (Google Authenticator, Microsoft Authenticator…), leia o QR code.
            </p>
            <img src={cadastro.qr} alt="QR code para cadastrar o Investindo! no app autenticador" width={180} height={180}
              style={{ background: '#FFFFFF', padding: 8, borderRadius: 12, alignSelf: 'start' }} />
            <p className="corpo-pequeno suave" style={{ margin: 0 }}>
              Sem câmera? Digite a chave: <code style={{ wordBreak: 'break-all' }}>{cadastro.segredo}</code>
            </p>
            <Campo rotulo="2. Digite o código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" maxLength={7}
              value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/[^\d ]/g, ''))} className="numero" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="botao botao-principal" disabled={ocupado || codigo.replace(/\D/g, '').length !== 6}>Ativar</button>
              <button type="button" className="botao botao-secundario" disabled={ocupado} onClick={() => executar(async () => {
                await supabase.auth.mfa.unenroll({ factorId: cadastro.id });
                setCadastro(null);
                setCodigo('');
              })}>Cancelar</button>
            </div>
          </form>
        ) : (
          <>
            <p className="corpo-pequeno suave" style={{ margin: 0 }}>
              Além da senha, o app pede um código que muda a cada 30 segundos no seu celular. Quem descobrir sua senha não entra.
            </p>
            <button className="botao botao-secundario" disabled={ocupado || fatores === null} onClick={iniciarDuasEtapas}>
              <ShieldCheck size={20} className="icone" aria-hidden /> Ativar verificação em duas etapas
            </button>
          </>
        )}
      </div>
    </section>
  );
}
