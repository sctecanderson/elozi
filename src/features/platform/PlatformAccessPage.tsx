import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { supabase } from '../../lib/supabase';
import { getPlatformAccess } from './platformRestaurants';
import { getStaffAccess } from '../auth/staffAuth';

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

function IconMail({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function IconLock({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconEye({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function IconShieldCheck({ className = 'w-3.5 h-3.5' }: { className?: string }) {
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
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconGoogle({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export function PlatformAccessPage() {
  const navigate = useNavigate();
  const { restaurantSlug = '' } = useParams<{ restaurantSlug?: string }>();
  const submitting = useRef(false);
  const mounted = useRef(false);

  const isPlatformAccess =
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/plataforma');

  // Inicializa o tema baseado exclusivamente na preferência salva ou no elemento raiz (como a Landing Page)
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
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
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

  async function redirectPostAuth(): Promise<boolean> {
    try {
      // 1. Caso originado por rota de restaurante específico (ex: /noma/acesso ou /brasa/acesso)
      if (restaurantSlug) {
        const staffAccess = await getStaffAccess(restaurantSlug);
        if (staffAccess) {
          const destination =
            staffAccess.role === 'waiter'
              ? `/${restaurantSlug}/equipe`
              : `/${restaurantSlug}/admin`;
          navigate(destination, { replace: true });
          return true;
        }

        // Se o usuário não faz parte do restaurante específico da URL, checa seus outros restaurantes
        const { data: members } = await supabase
          .from('restaurant_members')
          .select('restaurant_id, role, active')
          .eq('active', true);

        if (members && members.length > 0) {
          const targetMember = members.find((m) => m.role === 'admin') || members[0];
          const { data: userRest } = await supabase
            .from('restaurants')
            .select('slug')
            .eq('id', targetMember.restaurant_id)
            .eq('active', true)
            .maybeSingle();

          if (userRest?.slug) {
            const destination =
              targetMember.role === 'waiter'
                ? `/${userRest.slug}/equipe`
                : `/${userRest.slug}/admin`;
            navigate(destination, { replace: true });
            return true;
          }
        }

        setError(
          `Sua conta não possui permissão ativa para a equipe de "${restaurantSlug}".`,
        );
        return false;
      }

      // 2. Caso geral de login (/login ou /acesso)
      const { data: members, error: memberError } = await supabase
        .from('restaurant_members')
        .select('restaurant_id, role, active')
        .eq('active', true);

      if (!memberError && members && members.length > 0) {
        const targetMember = members.find((m) => m.role === 'admin') || members[0];
        const { data: restaurant, error: restError } = await supabase
          .from('restaurants')
          .select('slug, active')
          .eq('id', targetMember.restaurant_id)
          .eq('active', true)
          .maybeSingle();

        if (!restError && restaurant?.slug) {
          const destination =
            targetMember.role === 'waiter'
              ? `/${restaurant.slug}/equipe`
              : `/${restaurant.slug}/admin`;
          navigate(destination, { replace: true });
          return true;
        }
      }

      // 3. Checa se é Super Admin da plataforma
      let allowedPlatform = false;
      try {
        allowedPlatform = await getPlatformAccess();
      } catch {
        allowedPlatform = false;
      }

      if (allowedPlatform && isPlatformAccess) {
        navigate('/plataforma/restaurantes', { replace: true });
        return true;
      }

      // 4. Caso não possua nenhum restaurante vinculado:
      if (isPlatformAccess) {
        setDenied(true);
        return false;
      }

      setError(
        'Sua conta não possui nenhum restaurante vinculado. Crie seu restaurante para começar o teste grátis de 7 dias.',
      );
      return false;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível verificar seu destino de acesso.',
      );
      return false;
    }
  }

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

        if (disposed) return;

        const redirected = await redirectPostAuth();

        if (disposed) return;

        if (!redirected && isPlatformAccess) {
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
  }, [navigate, restaurantSlug]);

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

      const redirected = await redirectPostAuth();

      if (!mounted.current) return;

      if (!redirected && isPlatformAccess) {
        setDenied(true);
        return;
      }
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

  async function handleGoogleLogin() {
    try {
      setError('');
      const returnUrl = restaurantSlug
        ? `${window.location.origin}/${restaurantSlug}/acesso`
        : `${window.location.origin}/acesso`;

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: returnUrl,
        },
      });
      if (oauthError) {
        throw oauthError;
      }
    } catch (cause) {
      setError(
        cause instanceof Error && !cause.message.includes('not enabled')
          ? cause.message
          : 'Login com Google em configuração. Por favor, entre com seu e-mail e senha.',
      );
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
      className={`min-h-screen flex items-center justify-center p-4 lg:p-8 transition-colors duration-200 ${
        isDark
          ? 'bg-[#0c0d0e] text-zinc-100'
          : 'bg-[#FAF6F0] bg-[url(\'/landing/background.png\')] bg-cover bg-center bg-no-repeat text-zinc-900'
      }`}
    >
      <div className="w-full max-w-4xl flex flex-col items-center">
        {/*
          Card Principal:
          - Modo Claro: 100% transparente (sem fundo, sem borda externa, sem sombra externa).
            Apenas a linha central divisória entre as 2 colunas.
          - Modo Escuro: Mantido conforme o tema black (fundo #18181b/95, borda escura, sombra, cantos rounded-3xl).
        */}
        <section
          className={`w-full transition-all ${
            isDark
              ? 'bg-[#18181b]/95 rounded-3xl shadow-xl border border-zinc-800 overflow-hidden'
              : 'bg-transparent border-0 shadow-none'
          }`}
        >
          <div
            className={`grid grid-cols-1 md:grid-cols-12 ${
              isDark
                ? 'md:divide-x md:divide-zinc-800'
                : 'divide-y md:divide-y-0 md:divide-x divide-zinc-300/80'
            }`}
          >
            {/* COLUNA ESQUERDA (5 Colunas — Branding e Mascote) */}
            <div className="md:col-span-5 p-6 sm:p-8 lg:p-10 flex flex-col justify-between">
              {/* Topo: Logo */}
              <div>
                <Link to="/" className="inline-flex items-center">
                  <img
                    src="/landing/Eloozi.png"
                    alt="Elozi"
                    className={`h-12 w-auto object-contain object-left transition-all ${
                      isDark ? 'brightness-0 invert' : ''
                    }`}
                  />
                </Link>

                {/* Centro: Título e Subtítulo */}
                <h2
                  className={`text-2xl lg:text-[36px] font-extrabold leading-tight mt-6 ${
                    isDark ? 'text-white' : 'text-zinc-900'
                  }`}
                >
                  Sua equipe também faz parte dessa experiência!
                </h2>
                <p
                  className={`text-xs lg:text-sm mt-3 leading-relaxed ${
                    isDark ? 'text-zinc-400' : 'text-zinc-600'
                  }`}
                >
                  Acesse o painel da sua equipe e mantenha tudo funcionando de forma rápida, segura e organizada.
                </p>
              </div>

              {/* Base: Mascote Apontando + Frase de Impacto lado a lado */}
              <div className="flex items-end gap-3 mt-8">
                <img
                  src="/landing/mascote-aponta.png"
                  alt="Mascote Elozi"
                  className="w-28 sm:w-32 lg:w-36 h-auto object-contain shrink-0 drop-shadow-md"
                />
                <div
                  className={`text-xs sm:text-[13px] font-bold leading-snug pb-1 ${
                    isDark ? 'text-zinc-200' : 'text-zinc-800'
                  }`}
                >
                  o <span className="text-red-600 font-extrabold italic text-base sm:text-lg">super poder</span>
                  <br />
                  que faltava no seu
                  <br />
                  negócio agora você
                  <br />
                  encontra aqui!
                </div>
              </div>
            </div>

            {/* COLUNA DIREITA (7 Colunas — Formulário de Acesso) */}
            <div className="md:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-center">
              {/* Barra superior com link voltar e alternador de tema */}
              <div className="flex items-center justify-between mb-4">
                <Link
                  to={restaurantSlug ? `/${restaurantSlug}` : '/'}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                    isDark
                      ? 'text-zinc-400 hover:text-white'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  ← {restaurantSlug ? 'Voltar ao cardápio' : 'Voltar ao início'}
                </Link>

                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label="Alternar tema claro/escuro"
                  className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                    isDark
                      ? 'border-[#E51E25]/40 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                      : 'border-[#E51E25]/35 bg-white text-zinc-700 hover:bg-zinc-50 shadow-2xs'
                  }`}
                >
                  {isDark ? <IconMoon className="w-3.5 h-3.5" /> : <IconSun className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Cabeçalho do Formulário */}
              <div>
                <h1
                  className={`text-xl lg:text-2xl font-extrabold ${
                    isDark ? 'text-white' : 'text-zinc-900'
                  }`}
                >
                  Acesso da Equipe
                </h1>
                <p
                  className={`text-xs lg:text-sm mt-1 mb-6 ${
                    isDark ? 'text-zinc-400' : 'text-zinc-500'
                  }`}
                >
                  {restaurantSlug
                    ? `Digite suas credenciais para entrar na equipe de @${restaurantSlug}.`
                    : 'Digite suas credenciais para entrar no painel.'}
                </p>
              </div>

              {checking ? (
                <div
                  role="status"
                  className={`py-8 flex items-center justify-center gap-2.5 text-sm font-medium ${
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
                  <span>Verificando acesso…</span>
                </div>
              ) : denied ? (
                <div className="space-y-4">
                  <div
                    role="alert"
                    className={`rounded-xl border p-4 text-xs sm:text-sm font-medium leading-relaxed ${
                      isDark
                        ? 'bg-red-950/50 border-red-900/60 text-red-200'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    {isPlatformAccess
                      ? 'Esta conta não possui autorização para administrar a Elozi.'
                      : 'Esta conta não possui restaurantes vinculados.'}
                  </div>

                  <button
                    type="button"
                    onClick={() => void changeAccount()}
                    disabled={busy}
                    className="w-full h-11 rounded-xl bg-red-600 hover:bg-red-700 !text-white text-white font-bold text-sm shadow-md transition-all flex items-center justify-center disabled:opacity-60 cursor-pointer"
                  >
                    {busy ? 'Saindo…' : 'Entrar com outra conta'}
                  </button>
                </div>
              ) : viewMode === 'forgot_password' ? (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <fieldset disabled={busy} className="space-y-4">
                    <div>
                      <label
                        htmlFor="recovery-email"
                        className={`block text-xs font-bold mb-1.5 ${
                          isDark ? 'text-zinc-200' : 'text-zinc-800'
                        }`}
                      >
                        E-mail cadastrado
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                          <IconMail className="w-4 h-4" />
                        </span>
                        <input
                          id="recovery-email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="seu@exemplo.com"
                          className={`w-full rounded-xl pl-10 pr-3.5 py-3 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all ${
                            isDark
                              ? 'border border-zinc-700 bg-zinc-900 text-white focus:bg-zinc-900'
                              : 'border border-zinc-300 bg-white text-zinc-900 focus:bg-white shadow-2xs'
                          }`}
                        />
                      </div>
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
                      className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-700 !text-white text-white font-bold text-sm shadow-md shadow-red-600/20 transition-all flex items-center justify-center disabled:opacity-60 cursor-pointer"
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
                      className={`w-full py-3 rounded-xl border font-semibold text-xs transition-colors cursor-pointer ${
                        isDark
                          ? 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                          : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      Voltar ao login
                    </button>
                  </fieldset>
                </form>
              ) : (
                <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                  <fieldset disabled={busy} className="space-y-4">
                    {/* E-mail */}
                    <div>
                      <label
                        htmlFor="login-email"
                        className={`block text-xs font-bold mb-1.5 ${
                          isDark ? 'text-zinc-200' : 'text-zinc-800'
                        }`}
                      >
                        E-mail ou usuário
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                          <IconMail className="w-4 h-4" />
                        </span>
                        <input
                          id="login-email"
                          type="email"
                          autoComplete="username"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="seu@exemplo.com"
                          className={`w-full rounded-xl pl-10 pr-3.5 py-3 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all ${
                            isDark
                              ? 'border border-zinc-700 bg-zinc-900 text-white focus:bg-zinc-900'
                              : 'border border-zinc-300 bg-white text-zinc-900 focus:bg-white shadow-2xs'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Senha */}
                    <div>
                      <label
                        htmlFor="login-password"
                        className={`block text-xs font-bold mb-1.5 ${
                          isDark ? 'text-zinc-200' : 'text-zinc-800'
                        }`}
                      >
                        Senha
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                          <IconLock className="w-4 h-4" />
                        </span>
                        <input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Digite sua senha"
                          className={`w-full rounded-xl pl-10 pr-11 py-3 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all ${
                            isDark
                              ? 'border border-zinc-700 bg-zinc-900 text-white focus:bg-zinc-900'
                              : 'border border-zinc-300 bg-white text-zinc-900 focus:bg-white shadow-2xs'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                          className={`absolute right-3.5 top-1/2 -translate-y-1/2 p-1 cursor-pointer transition-colors ${
                            isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-400 hover:text-zinc-600'
                          }`}
                        >
                          {showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Linha de Opções: Manter conectado + Esqueci minha senha */}
                    <div className="flex items-center justify-between pt-0.5">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="w-4 h-4 rounded border-zinc-300 accent-red-600 text-red-600 focus:ring-red-600 cursor-pointer"
                        />
                        <span
                          className={`text-xs ${
                            isDark ? 'text-zinc-400' : 'text-zinc-600'
                          }`}
                        >
                          Manter conectado
                        </span>
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          setViewMode('forgot_password');
                          setError('');
                          setRecoveryNotice('');
                        }}
                        className="text-xs font-semibold text-red-600 hover:underline cursor-pointer"
                      >
                        Esqueceu sua senha?
                      </button>
                    </div>

                    {/* Botão Principal de Submit */}
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full py-3.5 mt-6 rounded-xl bg-red-600 hover:bg-red-700 !text-white text-white font-bold text-sm shadow-md shadow-red-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                    >
                      {busy ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>Entrando…</span>
                        </span>
                      ) : (
                        <>
                          <span>Entrar</span>
                          <span aria-hidden="true" className="text-base leading-none">→</span>
                        </>
                      )}
                    </button>
                  </fieldset>

                  {/* Separador ou */}
                  <div className="relative my-4 flex items-center justify-center">
                    <div
                      className={`w-full border-t ${
                        isDark ? 'border-zinc-800' : 'border-zinc-300/80'
                      }`}
                    />
                    <span
                      className={`absolute px-3 text-xs ${
                        isDark
                          ? 'bg-[#18181b] text-zinc-400'
                          : 'bg-[#FAF6F0] text-zinc-500'
                      }`}
                    >
                      ou
                    </span>
                  </div>

                  {/* Botão Secundário Google */}
                  <button
                    type="button"
                    onClick={() => void handleGoogleLogin()}
                    className={`w-full py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2.5 transition-all shadow-2xs cursor-pointer ${
                      isDark
                        ? 'bg-zinc-800 border border-zinc-700 hover:bg-zinc-750 text-zinc-200'
                        : 'bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-700'
                    }`}
                  >
                    <IconGoogle className="w-4 h-4" />
                    <span>Entrar com Google</span>
                  </button>

                  {/* DESTAQUE CLARO: Criar meu restaurante grátis (7 dias) dentro do card */}
                  <div
                    className={`mt-5 pt-4 border-t text-center ${
                      isDark ? 'border-zinc-800/80' : 'border-zinc-300/70'
                    }`}
                  >
                    <p
                      className={`text-xs mb-2 font-medium ${
                        isDark ? 'text-zinc-400' : 'text-zinc-600'
                      }`}
                    >
                      Ainda não tem conta na Elozi?
                    </p>
                    <Link
                      to="/criar-conta"
                      className={`inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs group ${
                        isDark
                          ? 'border border-red-900/60 bg-red-950/30 hover:bg-red-950/50 text-red-400'
                          : 'border border-red-300 hover:border-red-500 bg-red-50/80 hover:bg-red-100 text-red-600'
                      }`}
                    >
                      <span>Criar meu restaurante grátis (7 dias)</span>
                      <span className="ml-1.5 transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
                    </Link>
                  </div>
                </form>
              )}

              {/* Mensagem de Erro */}
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

              {/* Rodapé Interno do Card */}
              <div
                className={`mt-5 pt-3 flex items-center gap-1.5 text-[11px] border-t ${
                  isDark
                    ? 'border-zinc-800/80 text-zinc-400'
                    : 'border-zinc-300/70 text-zinc-500'
                }`}
              >
                <IconShieldCheck className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <span>Ambiente seguro e protegido</span>
              </div>
            </div>
          </div>
        </section>

        {/* Link adicional abaixo do card com alta visibilidade */}
        <div className="mt-4 text-center">
          <Link
            to="/criar-conta"
            className={`text-xs font-medium transition-colors ${
              isDark
                ? 'text-zinc-400 hover:text-red-400'
                : 'text-zinc-700 hover:text-red-600'
            }`}
          >
            Ainda não tem conta? <strong className="underline text-red-600 font-bold">Criar meu restaurante grátis (7 dias)</strong>
          </Link>
        </div>
      </div>
    </main>
  );
}
