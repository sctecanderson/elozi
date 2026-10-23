import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { getPlatformAccess } from './platformRestaurants';

function IconSun({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function IconMoon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function PlatformAccessPage() {
  const navigate = useNavigate();
  const submitting = useRef(false);
  const mounted = useRef(false);

  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = window.localStorage.getItem('elozi_public_theme_preference');
      if (stored === 'dark') return true;
      if (stored === 'light') return false;
    } catch {
      // Falha silenciosa de storage
    }
    return (
      document.documentElement.getAttribute('data-theme') === 'dark' ||
      document.documentElement.classList.contains('dark') ||
      window.matchMedia?.('(prefers-color-scheme: dark)').matches ||
      false
    );
  });

  const [checking, setChecking] = useState(true);
  const [viewMode, setViewMode] = useState<'login' | 'forgot_password'>('login');
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const mode = isDark ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', mode);
      document.documentElement.classList.toggle('dark', isDark);
      try {
        window.localStorage.setItem('elozi_public_theme_preference', mode);
      } catch {
        // Falha silenciosa de gravação em storage restrito
      }
    }
  }, [isDark]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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

  return (
    <main
      className={`min-h-dvh flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-200 ${
        isDark ? 'dark bg-[#0c0d0e] text-zinc-100' : 'bg-[#FAF7F2] text-zinc-900'
      }`}
    >
      <section
        className={`w-full max-w-md rounded-2xl border p-6 sm:p-8 shadow-xl transition-all duration-200 ${
          isDark
            ? 'bg-[#18181b] border-zinc-800 text-zinc-100 shadow-2xl shadow-black/70'
            : 'bg-white border-stone-200/90 text-zinc-900 shadow-xl shadow-stone-900/5'
        }`}
      >
        {/* Topo do Card com Logo e Toggle de Tema */}
        <div className="flex items-start justify-between">
          <div>
            <div
              className={`text-[22px] sm:text-[24px] font-bold tracking-[0.25em] leading-none select-none ${
                isDark ? 'text-white' : 'text-zinc-900'
              }`}
            >
              E L <span className="text-[#E51E25]">O</span> Z I
            </div>
            <span
              className={`text-[10px] font-semibold tracking-[0.22em] uppercase mt-1.5 block ${
                isDark ? 'text-zinc-400' : 'text-zinc-500'
              }`}
            >
              EXPERIÊNCIAS DIGITAIS
            </span>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Alternar tema claro/escuro"
            className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all ${
              isDark
                ? 'border-[#E51E25]/40 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:border-[#E51E25]/70'
                : 'border-[#E51E25]/35 bg-[#FAF7F2] text-zinc-700 hover:bg-white hover:border-[#E51E25]/70 shadow-2xs'
            }`}
          >
            {isDark ? <IconMoon className="w-4 h-4" /> : <IconSun className="w-4 h-4" />}
          </button>
        </div>

        <h1
          className={`mt-5 text-xl sm:text-2xl font-bold tracking-tight ${
            isDark ? 'text-white' : 'text-zinc-900'
          }`}
        >
          Administração da plataforma
        </h1>

        <p
          className={`mt-1.5 text-xs sm:text-sm ${
            isDark ? 'text-zinc-400' : 'text-zinc-600'
          }`}
        >
          Acesso reservado à equipe responsável pela Elozi.
        </p>

        {checking ? (
          <div
            role="status"
            className={`mt-8 flex items-center justify-center gap-2.5 py-6 text-sm font-medium ${
              isDark ? 'text-zinc-300' : 'text-zinc-600'
            }`}
          >
            <svg
              className="animate-spin h-5 w-5 text-[#E51E25]"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Verificando seu acesso…</span>
          </div>
        ) : denied ? (
          <div className="mt-6 space-y-4">
            <div
              role="alert"
              className={`rounded-xl border p-4 text-xs sm:text-sm font-medium leading-relaxed ${
                isDark
                  ? 'bg-red-950/50 border-red-900/60 text-red-200'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              Esta conta não possui autorização para administrar a Elozi.
            </div>

            <button
              type="button"
              onClick={() => void changeAccount()}
              disabled={busy}
              className="w-full h-11 rounded-xl bg-[#E51E25] hover:bg-red-700 !text-white text-white font-bold text-sm shadow-md transition-all flex items-center justify-center disabled:opacity-60"
            >
              {busy ? 'Saindo…' : 'Entrar com outra conta'}
            </button>
          </div>
        ) : viewMode === 'forgot_password' ? (
          <form onSubmit={handleForgotSubmit} className="mt-6 space-y-4">
            <fieldset disabled={busy} className="space-y-4">
              <div>
                <label
                  htmlFor="platform-recovery-email"
                  className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${
                    isDark ? 'text-zinc-300' : 'text-zinc-700'
                  }`}
                >
                  E-mail institucional
                </label>
                <input
                  id="platform-recovery-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-all outline-none ${
                    isDark
                      ? 'bg-zinc-950/80 border-zinc-700 text-white placeholder-zinc-500 focus:bg-zinc-950 focus:border-red-500 focus:ring-1 focus:ring-red-500/30'
                      : 'bg-stone-50 border-stone-300 text-zinc-900 placeholder-zinc-400 focus:bg-white focus:border-red-600 focus:ring-1 focus:ring-red-600/30'
                  }`}
                />
              </div>

              {recoveryNotice && (
                <div
                  role="status"
                  className={`rounded-xl border p-3.5 text-xs font-medium leading-relaxed ${
                    isDark
                      ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  }`}
                >
                  {recoveryNotice}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full h-11 rounded-xl bg-[#E51E25] hover:bg-red-700 !text-white text-white font-bold text-sm tracking-wide shadow-md shadow-red-600/20 transition-all flex items-center justify-center disabled:opacity-60 active:scale-[0.99]"
              >
                {busy ? 'Enviando e-mail…' : 'Enviar link de recuperação'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewMode('login');
                  setError('');
                  setRecoveryNotice('');
                }}
                className={`w-full h-11 rounded-xl border font-semibold text-sm transition-colors ${
                  isDark
                    ? 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                    : 'border-stone-300 bg-stone-100 hover:bg-stone-200 text-zinc-800'
                }`}
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
              <div>
                <label
                  htmlFor="platform-email"
                  className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${
                    isDark ? 'text-zinc-300' : 'text-zinc-700'
                  }`}
                >
                  E-mail
                </label>
                <input
                  id="platform-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-all outline-none ${
                    isDark
                      ? 'bg-zinc-950/80 border-zinc-700 text-white placeholder-zinc-500 focus:bg-zinc-950 focus:border-red-500 focus:ring-1 focus:ring-red-500/30'
                      : 'bg-stone-50 border-stone-300 text-zinc-900 placeholder-zinc-400 focus:bg-white focus:border-red-600 focus:ring-1 focus:ring-red-600/30'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="platform-password"
                    className={`block text-xs font-semibold uppercase tracking-wider ${
                      isDark ? 'text-zinc-300' : 'text-zinc-700'
                    }`}
                  >
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('forgot_password');
                      setError('');
                      setRecoveryNotice('');
                    }}
                    className={`text-xs font-semibold underline transition-colors ${
                      isDark
                        ? 'text-red-400 hover:text-red-300'
                        : 'text-red-600 hover:text-red-700'
                    }`}
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
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••••"
                  className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-all outline-none ${
                    isDark
                      ? 'bg-zinc-950/80 border-zinc-700 text-white placeholder-zinc-500 focus:bg-zinc-950 focus:border-red-500 focus:ring-1 focus:ring-red-500/30'
                      : 'bg-stone-50 border-stone-300 text-zinc-900 placeholder-zinc-400 focus:bg-white focus:border-red-600 focus:ring-1 focus:ring-red-600/30'
                  }`}
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full h-11 sm:h-12 mt-2 rounded-xl bg-[#E51E25] hover:bg-red-700 !text-white text-white font-bold text-sm tracking-wide shadow-md shadow-red-600/20 transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60 cursor-pointer"
              >
                {busy ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Verificando acesso…</span>
                  </>
                ) : (
                  'Entrar na Elozi'
                )}
              </button>
            </fieldset>
          </form>
        )}

        {error && (
          <div
            role="alert"
            className={`mt-4 rounded-xl border p-3.5 text-xs font-medium leading-relaxed ${
              isDark
                ? 'bg-red-950/50 border-red-900/60 text-red-200'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <Link
            to="/"
            className={`inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium underline transition-colors ${
              isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            ← Voltar ao início
          </Link>
        </div>

        <div className={`mt-5 pt-5 border-t ${isDark ? 'border-zinc-800' : 'border-stone-200'}`}>
          <Link
            to="/criar-conta"
            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs sm:text-sm font-bold shadow-sm transition-all group ${
              isDark
                ? 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 !text-white text-white'
                : 'bg-zinc-900 hover:bg-black !text-white text-white'
            }`}
          >
            <span className="!text-white text-white">Testar Grátis por 7 Dias — Criar Meu Restaurante</span>
            <span className="!text-white text-white transition-transform group-hover:translate-x-0.5" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}
