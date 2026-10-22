import React from 'react';

interface TermsOfUseModalProps {
  open: boolean;
  onClose: () => void;
  onAccept?: () => void;
}

export function TermsOfUseModal({ open, onClose, onAccept }: TermsOfUseModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs"
    >
      <div
        className="w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col max-h-[88vh] overflow-hidden"
        style={{
          background: 'var(--color-bg-panel, #ffffff)',
          borderColor: 'var(--color-border, #e7e5e4)',
          color: 'var(--color-text-main, #1c1917)',
        }}
      >
        {/* Cabeçalho do Modal */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--color-border, #e7e5e4)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: 'var(--color-bg-subtle, #f5f5f4)',
                color: 'var(--admin-primary-btn, #2B1D17)',
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div>
              <h2 id="terms-modal-title" className="text-lg font-bold leading-tight m-0">
                Termos de Uso e Licenciamento de Software SaaS Elozi
              </h2>
              <p className="text-xs m-0 mt-0.5" style={{ color: 'var(--color-text-muted, #78716c)' }}>
                Contrato de licença de uso operacional, ciclo de assinatura e responsabilidades fiscais
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar Termos de Uso"
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-75 transition-opacity cursor-pointer border-0 bg-transparent"
            style={{ color: 'var(--color-text-muted, #78716c)' }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Corpo dos Termos */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm leading-relaxed">
          <section className="space-y-1.5">
            <h3 className="text-sm font-bold uppercase tracking-wider m-0">
              1. Objeto do Licenciamento SaaS
            </h3>
            <p className="m-0 text-xs sm:text-sm" style={{ color: 'var(--color-text-muted, #57534e)' }}>
              A plataforma <strong>Elozi</strong> concede ao estabelecimento contratante uma licença de uso não exclusiva,
              intransferível e temporária de software como serviço (SaaS) voltada à exibição de cardápio digital interativo,
              abertura e gestão de comandas internas de mesa, painel de produção para cozinha e bar (KDS), controle de
              insumos de estoque e relatórios gerenciais de turno.
            </p>
          </section>

          <section
            className="p-4 rounded-xl border space-y-1.5"
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              borderColor: 'rgba(245, 158, 11, 0.35)',
            }}
          >
            <h3 className="text-sm font-bold uppercase tracking-wider m-0 text-amber-800 dark:text-amber-300">
              2. Natureza Operacional e Isenção Fiscal (Cláusula Essencial)
            </h3>
            <p className="m-0 text-xs sm:text-sm" style={{ color: 'var(--color-text-main, #1c1917)' }}>
              A <strong>Elozi</strong> atua exclusivamente como provedora de tecnologia para <strong>gestão operacional de salão,
              cardápio digital, comandas internas e KDS</strong>. Os extratos de conferência de mesa e relatórios de fechamento de
              turno gerados pelo sistema possuem caráter estritamente gerencial e de conferência prévia (<em>Não são Documentos Fiscais</em>).
            </p>
            <p className="m-0 text-xs sm:text-sm" style={{ color: 'var(--color-text-main, #1c1917)' }}>
              Cabe <strong>exclusiva e integralmente ao estabelecimento comercial licenciado</strong> a obrigação de emitir os
              respectivos documentos fiscais eletrônicos (NFC-e, CF-e SAT, Nota Fiscal de Consumidor ou equivalente) perante a
              Secretaria da Fazenda Estadual (SEFAZ) e órgãos municipais/federais, bem como a correta parametrização tributária e
              o recolhimento de todos os impostos incidentes sobre suas vendas aos consumidores finais.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-sm font-bold uppercase tracking-wider m-0">
              3. Período de Testes Grátis (Trial de 7 Dias) e Ciclo de Assinatura
            </h3>
            <p className="m-0 text-xs sm:text-sm" style={{ color: 'var(--color-text-muted, #57534e)' }}>
              Ao realizar o auto-cadastro na plataforma, o estabelecimento recebe <strong>7 (sete) dias corridos de avaliação
              gratuita (Trial)</strong> no plano Profissional (com até 15 mesas simultâneas e KDS liberado) para validação operacional.
              Para manter o acesso contínuo após o término do período de avaliação, o contratante deverá optar por um dos planos
              vigentes (Básico, Profissional ou Premium) no ciclo mensal ou anual.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-sm font-bold uppercase tracking-wider m-0">
              4. Política de Tolerância (Grace Period) e Suspensão por Inadimplência
            </h3>
            <p className="m-0 text-xs sm:text-sm" style={{ color: 'var(--color-text-muted, #57534e)' }}>
              Após a data de vencimento da assinatura ou do período Trial sem renovação confirmada, o sistema concede um
              <strong> período de tolerância (Grace Period) de 3 (três) dias corridos</strong> com avisos visuais no painel
              administrativo para evitar interrupções abruptas durante o expediente do restaurante. Ultrapassados os 3 dias de
              atraso sem quitação da fatura, o acesso operacional ao painel administrativo, abertura de novas comandas e KDS é
              automaticamente bloqueado até a compensação do pagamento via PIX ou Cartão.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-sm font-bold uppercase tracking-wider m-0">
              5. Segurança de Dados, LGPD e Disponibilidade
            </h3>
            <p className="m-0 text-xs sm:text-sm" style={{ color: 'var(--color-text-muted, #57534e)' }}>
              Os dados operacionais de cada restaurante são isolados por políticas criptográficas de segurança em nível de linha
              (Row-Level Security). O contratante é responsável pela guarda das credenciais de acesso de sua equipe administrativa
              e de garçons, podendo revogar convites ou redefinir acessos a qualquer momento no painel.
            </p>
          </section>
        </div>

        {/* Rodapé do Modal */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t"
          style={{ borderColor: 'var(--color-border, #e7e5e4)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold cursor-pointer transition-opacity hover:opacity-80"
            style={{
              borderColor: 'var(--color-border, #d6d3d1)',
              background: 'transparent',
              color: 'var(--color-text-main, #1c1917)',
            }}
          >
            Fechar
          </button>

          {onAccept && (
            <button
              type="button"
              onClick={() => {
                onAccept();
                onClose();
              }}
              className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white cursor-pointer transition-opacity hover:opacity-90 border-0"
              style={{ background: 'var(--admin-primary-btn, #2B1D17)' }}
            >
              Li e Concordo com os Termos
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
