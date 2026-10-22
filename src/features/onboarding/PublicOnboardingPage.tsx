import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { TermsOfUseModal } from '../../components/TermsOfUseModal';

function slugifyRestaurantName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function formatPhoneBR(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

interface OnboardingResult {
  restaurant_id: string;
  slug: string;
  name: string;
  trial_expires_at: string;
}

export function PublicOnboardingPage() {
  const navigate = useNavigate();

  const [restaurantName, setRestaurantName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRestaurantNameChange = (value: string) => {
    setRestaurantName(value);
    if (!slugTouched) {
      setSlug(slugifyRestaurantName(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugTouched(true);
    const sanitized = value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+/, '')
      .slice(0, 48);
    setSlug(sanitized);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = restaurantName.trim();
    const trimmedSlug = slug.replace(/^-+|-+$/g, '').trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (trimmedName.length < 2) {
      setError('Informe o nome do restaurante (mínimo 2 caracteres).');
      return;
    }

    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(trimmedSlug) || trimmedSlug.length < 3) {
      setError('O endereço (slug) deve conter apenas letras minúsculas, números e hífens (mínimo 3 caracteres).');
      return;
    }

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Informe um e-mail válido para o administrador.');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (!acceptedTerms) {
      setError('Você precisa ler e concordar com os Termos de Uso e Responsabilidade Fiscal para continuar.');
      return;
    }

    if (!supabase) {
      setError('Conexão com o banco de dados não configurada neste ambiente.');
      return;
    }

    setSubmitting(true);

    try {
      // 1. Verifica se já existe sessão ativa ou realiza o cadastro do administrador
      const { data: currentSessionData } = await supabase.auth.getSession();
      let activeSession = currentSessionData?.session ?? null;

      if (!activeSession || activeSession.user.email?.toLowerCase() !== trimmedEmail) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });

        if (signUpError) {
          // Caso o usuário já possua cadastro no Auth, tenta autenticar com a senha fornecida
          if (
            signUpError.message.toLowerCase().includes('already registered') ||
            signUpError.message.toLowerCase().includes('already been registered')
          ) {
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: trimmedEmail,
              password,
            });
            if (signInError) {
              throw new Error(
                'Este e-mail já possui cadastro. Verifique sua senha ou faça login para continuar.'
              );
            }
            activeSession = signInData.session;
          } else {
            throw signUpError;
          }
        } else {
          activeSession = signUpData.session;
          if (!activeSession && signUpData.user) {
            // Se o Supabase não retornou sessão imediata no signUp, tenta signInWithPassword
            const { data: signInData } = await supabase.auth.signInWithPassword({
              email: trimmedEmail,
              password,
            });
            activeSession = signInData.session;
          }
        }
      }

      if (!activeSession) {
        throw new Error(
          'Não foi possível iniciar a sessão autenticada. Verifique se a confirmação de e-mail está pendente.'
        );
      }

      // 2. Chama a RPC de auto-cadastro com seed automático (7 dias Pro Trial)
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'register_trial_restaurant_onboarding',
        {
          p_restaurant_name: trimmedName,
          p_slug: trimmedSlug,
          p_phone: phone.trim() || null,
        }
      );

      if (rpcError) {
        throw new Error(rpcError.message || 'Erro ao provisionar o restaurante.');
      }

      const result = rpcData as OnboardingResult;
      const targetSlug = result?.slug || trimmedSlug;

      // 3. Redireciona direto para o painel administrativo do novo restaurante
      navigate(`/${targetSlug}/admin`, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível concluir o cadastro.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8"
      style={{ background: '#f5f5f4', color: '#1c1917' }}
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="flex items-center justify-between mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ color: '#2B1D17' }}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Voltar ao Início</span>
          </Link>

          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
            style={{ background: 'rgba(43, 29, 23, 0.1)', color: '#2B1D17' }}
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Teste Grátis 7 Dias — Plano Pro</span>
          </span>
        </div>

        <div
          className="rounded-3xl p-6 sm:p-8 border shadow-xl"
          style={{ background: '#ffffff', borderColor: '#e7e5e4', color: '#1c1917' }}
        >
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#78716c' }}>
              Auto-Atendimento SaaS Elozi
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-1" style={{ color: '#2B1D17' }}>
              Criar Meu Restaurante
            </h1>
            <p className="text-sm mt-1.5 leading-relaxed" style={{ color: '#57534e' }}>
              Seu ambiente será criado instantaneamente com 3 mesas configuradas, cardápio demonstrativo e KDS pronto para testar agora mesmo.
            </p>
          </div>

          {error && (
            <div
              className="mb-5 p-4 rounded-2xl border text-sm font-medium flex items-start gap-3"
              style={{
                background: '#fef2f2',
                borderColor: '#fecaca',
                color: '#b91c1c',
              }}
            >
              <svg
                className="w-5 h-5 shrink-0 mt-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nome do Restaurante */}
            <div>
              <label
                htmlFor="onb-restaurant-name"
                className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                style={{ color: '#2B1D17' }}
              >
                Nome do Restaurante *
              </label>
              <input
                id="onb-restaurant-name"
                type="text"
                required
                placeholder="Ex: Pizzaria Bella Napoli"
                value={restaurantName}
                onChange={(e) => handleRestaurantNameChange(e.target.value)}
                className="w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2"
                style={{
                  background: '#ffffff',
                  borderColor: '#d6d3d1',
                  color: '#1c1917',
                }}
              />
            </div>

            {/* Slug / URL */}
            <div>
              <label
                htmlFor="onb-slug"
                className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                style={{ color: '#2B1D17' }}
              >
                Endereço Exclusivo do Cardápio (URL) *
              </label>
              <div
                className="flex items-center rounded-xl border overflow-hidden"
                style={{ borderColor: '#d6d3d1', background: '#fafaf9' }}
              >
                <span
                  className="px-3 py-2.5 text-xs font-mono border-r select-none"
                  style={{ color: '#78716c', borderColor: '#e7e5e4' }}
                >
                  elozi.com/
                </span>
                <input
                  id="onb-slug"
                  type="text"
                  required
                  placeholder="pizzaria-bella-napoli"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm font-mono font-semibold focus:outline-none"
                  style={{ background: '#ffffff', color: '#1c1917' }}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: '#78716c' }}>
                Seu painel ficará em: <strong style={{ color: '#2B1D17' }}>/{slug || 'seu-restaurante'}/admin</strong>
              </p>
            </div>

            {/* WhatsApp / Telefone Comercial */}
            <div>
              <label
                htmlFor="onb-phone"
                className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                style={{ color: '#2B1D17' }}
              >
                WhatsApp / Telefone Comercial
              </label>
              <input
                id="onb-phone"
                type="tel"
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(formatPhoneBR(e.target.value))}
                className="w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2"
                style={{
                  background: '#ffffff',
                  borderColor: '#d6d3d1',
                  color: '#1c1917',
                }}
              />
            </div>

            {/* E-mail e Senha */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="onb-email"
                  className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: '#2B1D17' }}
                >
                  E-mail do Administrador *
                </label>
                <input
                  id="onb-email"
                  type="email"
                  required
                  placeholder="contato@restaurante.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2"
                  style={{
                    background: '#ffffff',
                    borderColor: '#d6d3d1',
                    color: '#1c1917',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="onb-password"
                  className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: '#2B1D17' }}
                >
                  Senha de Acesso *
                </label>
                <input
                  id="onb-password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2"
                  style={{
                    background: '#ffffff',
                    borderColor: '#d6d3d1',
                    color: '#1c1917',
                  }}
                />
              </div>
            </div>

            {/* Resumo do Trial */}
            <div
              className="rounded-2xl p-4 border text-xs space-y-1.5"
              style={{ background: '#fafaf9', borderColor: '#e7e5e4', color: '#44403c' }}
            >
              <div className="font-bold uppercase tracking-wider" style={{ color: '#2B1D17' }}>
                Incluso no seu Teste Grátis de 7 Dias (Plano Pro):
              </div>
              <ul className="space-y-1 list-disc list-inside">
                <li>Até 15 mesas com QR Codes exclusivos para impressão em folha A4</li>
                <li>3 mesas e 5 produtos pré-cadastrados para teste imediato</li>
                <li>KDS Cozinha e Bar em tempo real + Impressão de Cupom Térmico 80mm/58mm</li>
                <li>Sem cobrança automática: você escolhe seu plano apenas se aprovar</li>
              </ul>
            </div>

            {/* Checkbox Termos de Uso */}
            <div className="pt-1">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-stone-300"
                />
                <span className="text-xs leading-relaxed" style={{ color: '#44403c' }}>
                  Li e concordo com os{' '}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setTermsModalOpen(true);
                    }}
                    className="font-bold underline hover:opacity-80"
                    style={{ color: '#2B1D17' }}
                  >
                    Termos de Uso e Responsabilidade Fiscal da Plataforma Elozi
                  </button>
                  .
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-white shadow-md transition-opacity hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: '#2B1D17' }}
            >
              {submitting ? (
                <span>Provisionando Restaurante e Cardápio...</span>
              ) : (
                <>
                  <span>Criar Meu Restaurante e Iniciar Teste de 7 Dias</span>
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <TermsOfUseModal open={termsModalOpen} onClose={() => setTermsModalOpen(false)} />
    </div>
  );
}
