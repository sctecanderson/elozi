import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { getPlatformAccess } from './platformRestaurants';

export function PlatformAccessPage() {
  const navigate = useNavigate();
  const submitting = useRef(false);
  const mounted = useRef(false);

  const [checking, setChecking] = useState(true);
  const [viewMode, setViewMode] = useState<'login' | 'forgot_password'>('login');
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    mounted.current = true;
    let disposed = false;

    async function restoreAccess() {
      try {
        const { data, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) {
          throw new Error(
            'Não foi possível recuperar seu login. Entre novamente.',
          );
        }

        if (
          !data.session ||
          data.session.user.is_anonymous
        ) {
          return;
        }

        const allowed = await getPlatformAccess();

        if (disposed) return;

        if (allowed) {
          navigate('/plataforma/restaurantes', {
            replace: true,
          });
        } else {
          setDenied(true);
        }
      } catch (cause) {
        if (!disposed) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível verificar seu acesso.',
          );
        }
      } finally {
        if (!disposed) setChecking(false);
      }
    }

    void restoreAccess();

    return () => {
      disposed = true;
      mounted.current = false;
    };
  }, [navigate]);


  async function handleForgotSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError('');
    setRecoveryNotice('');
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (resetErr) throw resetErr;
      setRecoveryNotice(`Enviamos um link de recuperação para ${email.trim()}. Verifique sua caixa de entrada e spam.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o e-mail de recuperação.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (submitting.current || checking) return;

    submitting.current = true;
    setBusy(true);
    setError('');

    try {
      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (loginError) {
        throw new Error(
          'Não foi possível entrar. Confira e-mail e senha.',
        );
      }

      if (mounted.current) setPassword('');

      const allowed = await getPlatformAccess();

      if (!mounted.current) return;

      if (!allowed) {
        setDenied(true);
        return;
      }

      navigate('/plataforma/restaurantes', {
        replace: true,
      });
    } catch (cause) {
      if (mounted.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível entrar na Elozi.',
        );
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function changeAccount() {
    if (submitting.current) return;

    submitting.current = true;
    setBusy(true);
    setError('');

    try {
      const { error: logoutError } =
        await supabase.auth.signOut({ scope: 'local' });

      if (logoutError) {
        throw new Error(
          'Não foi possível sair. Tente novamente.',
        );
      }

      if (!mounted.current) return;

      setDenied(false);
      setEmail('');
      setPassword('');
    } catch (cause) {
      if (mounted.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível trocar de conta.',
        );
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const theme = {
    '--brand': '#243447',
    '--page': '#F7F8FA',
    '--ink': '#1B2430',
  } as CSSProperties;

  return (
    <main
      style={theme}
      className="flex min-h-dvh items-center justify-center bg-[var(--page)] px-4 py-10 text-[var(--ink)]"
    >
      <section className="admin-card admin-form w-full max-w-md">
        <p className="mb-2 text-sm font-semibold">Elozi</p>

        <h1 className="text-2xl font-semibold">
          Administração da plataforma
        </h1>

        <p className="mt-2 text-sm opacity-75">
          Acesso reservado à equipe responsável pela Elozi.
        </p>

        {checking ? (
          <p role="status" className="mt-6">
            Verificando seu acesso…
          </p>
        ) : denied ? (
          <div className="mt-6 space-y-4">
            <p role="alert">
              Esta conta não possui autorização para administrar
              a Elozi.
            </p>

            <button
              type="button"
              onClick={() => void changeAccount()}
              disabled={busy}
              className="admin-button primary"
            >
              {busy ? 'Saindo…' : 'Entrar com outra conta'}
            </button>
          </div>
        ) : viewMode === 'forgot_password' ? (
          <form onSubmit={handleForgotSubmit} className="mt-6 space-y-4">
            <fieldset disabled={busy} className="space-y-4">
              <label htmlFor="platform-recovery-email">
                E-mail institucional
                <input
                  id="platform-recovery-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                />
              </label>

              {recoveryNotice && (
                <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 font-medium">
                  {recoveryNotice}
                </p>
              )}

              <button type="submit" className="admin-button primary w-full">
                {busy ? 'Enviando e-mail…' : 'Enviar link de recuperação'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewMode('login');
                  setError('');
                  setRecoveryNotice('');
                }}
                className="admin-button secondary w-full"
              >
                Voltar ao login
              </button>
            </fieldset>
          </form>
        ) : (
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="mt-6"
          >
            <fieldset disabled={busy} className="space-y-4">
              <label htmlFor="platform-email">
                E-mail
                <input
                  id="platform-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>

              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Senha</span>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('forgot_password');
                    setError('');
                    setRecoveryNotice('');
                  }}
                  className="text-xs text-stone-500 hover:text-[var(--brand)] underline font-medium"
                >
                  Esqueci minha senha
                </button>
              </div>
              <input
                id="platform-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
              />

              <button
                type="submit"
                className="admin-button primary w-full"
              >
                {busy ? 'Verificando acesso…' : 'Entrar na Elozi'}
              </button>
            </fieldset>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}

        <Link
          to="/"
          className="mt-6 inline-flex min-h-11 items-center text-sm underline"
        >
          Voltar ao início</Link>
        <div className="mt-4 pt-4 border-t border-stone-200">
          <Link
            to="/criar-conta"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-95"
            style={{ background: '#2B1D17' }}
          >
            <span>Testar Grátis por 7 Dias — Criar Meu Restaurante</span></Link>
        </div>

      </section>
    </main>
  );
}