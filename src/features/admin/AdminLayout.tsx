import { useState, useEffect } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
} from "react-router";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { signOutStaff, type StaffAccess } from "../auth/staffAuth";
import { ThemeToggleButton } from "../theme/ThemeToggleButton";
import { AdminTopbar } from "./AdminTopbar";
import { getPlatformAccess } from "../platform/platformRestaurants";

export function AdminLayout() {
  const access = useOutletContext<StaffAccess>();
  const { restaurant: r } = useRestaurant();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const location = useLocation();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    void getPlatformAccess().then(setIsPlatformAdmin).catch(() => setIsPlatformAdmin(false));
  }, []);

  let diffDays: number | null = null;
  if (r.subscriptionExpiresAt) {
    const diffMs = new Date(r.subscriptionExpiresAt).getTime() - Date.now();
    diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  const isExpiringSoon = diffDays !== null && diffDays > 0 && diffDays <= 5;
  const isGracePeriod = (diffDays !== null && diffDays <= 0 && diffDays >= -3) || r.billingStatus === 'grace_period';
  const isSevereOverdue = !isPlatformAdmin && ((diffDays !== null && diffDays < -3) || (r.billingStatus === 'expired' && (diffDays === null || diffDays <= -3)));
  const isBillingTab = location.pathname.endsWith('/assinatura');
  const links = [
    ["", "Visão geral", "home"],
    ["catalogo", "Cardápio", "menu"],
    ["kds", "KDS Cozinha/Bar", "kds"],
    ["estoque", "Estoque & Insumos", "package"],
    ["comentarios", "Comentários", "chat"],
    ["mesas", "Mesas e comandas", "table"],
    ["financeiro", "Financeiro / Caixa", "chart"],
    ["assinatura", "Assinatura & Planos", "card"],
    ["identidade", "Identidade visual", "settings"],
    ["midias", "Armazenamento", "media"],
    ["equipe", "Equipe e acessos", "user"],
  ] as const;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('elozi_admin_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('elozi_admin_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  async function logout() {
    setBusy(true);
    setError("");
    try {
      await signOutStaff();
      navigate(`/${r.slug}/acesso`, { replace: true });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível sair.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`admin-app ${sidebarCollapsed ? 'sidebar-collapsed' : ''} print:block print:p-0 print:m-0 print:bg-white print:overflow-visible`}>
      <a href="#admin-content" className="skip-link print:hidden">
        Pular para o conteúdo
      </a>
      <aside className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''} print:hidden`}>
        <div className="admin-sidebar-header">
          <Link to={`/${r.slug}/admin`} className="admin-logo">
            {r.logo ? (
              <img src={r.logo.url} alt={r.name} />
            ) : (
              <>
                {r.name}
                <small>{r.subtitle}</small>
              </>
            )}
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            className="admin-sidebar-toggle"
            aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            title={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          >
            {sidebarCollapsed ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M9 3v18" />
                <path d="m13 15 3-3-3-3" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M9 3v18" />
                <path d="m14 9-3 3 3 3" />
              </svg>
            )}
          </button>
        </div>
        <nav aria-label="Administração">
          {links.map(([path, label, icon]) => (
            <NavLink
              end
              key={path}
              to={`/${r.slug}/admin${path ? `/${path}` : ""}`}
              title={label}
            >
              <AdminIcon name={icon} />
              <span>{label}</span>
            </NavLink>
          ))}
          <Link to={`/${r.slug}/equipe`} title="Atendimento">
            <AdminIcon name="bell" />
            <span>Atendimento</span>
          </Link>
          <Link to={`/${r.slug}/acesso`} title="Minha conta">
            <AdminIcon name="user" />
            <span>Minha conta</span>
          </Link>
        </nav>
        <button
          type="button"
          className="admin-exit"
          disabled={busy}
          onClick={() => void logout()}
          title="Sair"
        >
          <AdminIcon name="exit" />
          <span>{busy ? "Saindo…" : "Sair"}</span>
        </button>
        {error && <p role="alert">{error}</p>}
      </aside>
      <div className="admin-workspace print:p-0 print:m-0 print:w-full print:block print:bg-white">
        <AdminTopbar restaurant={r} />
        {isExpiringSoon && !isGracePeriod && !isSevereOverdue && (
          <div
            role="alert"
            className="print:hidden"
            style={{
              padding: "10px 20px",
              background: "rgba(245, 158, 11, 0.12)",
              borderBottom: "1px solid rgba(245, 158, 11, 0.35)",
              color: "#b45309",
              fontSize: "13px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>
                <strong>Renovação de Assinatura:</strong> Restam apenas {diffDays} {diffDays === 1 ? 'dia' : 'dias'} para o término do seu plano.
              </span>
            </div>
            <Link
              to={`/${r.slug}/admin/assinatura`}
              style={{
                background: "#d97706",
                color: "#ffffff",
                padding: "4px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Renovar Plano
            </Link>
          </div>
        )}
        {isGracePeriod && !isSevereOverdue && (
          <div
            role="alert"
            className="print:hidden"
            style={{
              padding: "10px 20px",
              background: "rgba(239, 68, 68, 0.12)",
              borderBottom: "1px solid rgba(239, 68, 68, 0.35)",
              color: "#b91c1c",
              fontSize: "13px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>
                <strong>Atenção (Período de Tolerância):</strong> Sua assinatura venceu. O sistema será bloqueado em breve se não for regularizado.
              </span>
            </div>
            <Link
              to={`/${r.slug}/admin/assinatura`}
              style={{
                background: "#dc2626",
                color: "#ffffff",
                padding: "4px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Regularizar Agora
            </Link>
          </div>
        )}
        <main id="admin-content" className="print:p-0 print:m-0 print:w-full print:block">
          {isSevereOverdue && !isBillingTab ? (
            <div
              className="p-8 max-w-xl mx-auto my-12 text-center rounded-2xl border"
              style={{
                background: "var(--admin-card-bg, #ffffff)",
                borderColor: "var(--admin-border, #e7e5e4)",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05)",
              }}
            >
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                style={{ background: "rgba(239, 68, 68, 0.1)", color: "#dc2626" }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ color: "var(--admin-text, #1c1917)" }}>
                Acesso Administrativo Suspenso
              </h2>
              <p className="text-sm mb-6 leading-relaxed" style={{ color: "var(--admin-muted, #78716c)" }}>
                O período de tolerância de 3 dias expirou e a assinatura deste restaurante está suspensa.
                Para restabelecer imediatamente as operações de salão, comandas e visualização da cozinha, efetue o pagamento da fatura em aberto.
              </p>
              <Link
                to={`/${r.slug}/admin/assinatura`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
                style={{ background: "var(--brand-primary, #b91c1c)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="20" height="14" x="2" y="5" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                <span>Acessar Faturamento & Pagar</span>
              </Link>
            </div>
          ) : (
            <Outlet context={access} />
          )}
        </main>
      </div>
    </div>
  );
}
export function AdminIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
    menu: "M5 3h14v18H5ZM8 7h8M8 11h8M8 15h5",
    chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    table: "M3 9h18v4H3ZM5 13l-2 8M19 13l2 8M5 9V5h14v4",
    kds: "M12 2c1.5 3 4 5 4 8a6 6 0 1 1-12 0c0-3 2.5-5 4-8 1 2 2 3 4 0z",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
    media: "M3 3h18v18H3ZM3 17l6-7 5 6 3-3 4 5M16 7h1",
    user: "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-3a8 8 0 0 1 16 0v3Z",
    bell: "M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 21h4",
    package: "M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12",
    exit: "M10 3H4v18h6M9 12h12M17 8l4 4-4 4",
    card: "M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Zm0 5h20M6 15h2m4 0h6",
    chart: "M18 20V10M12 20V4M6 20v-6M3 20h18",
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.menu} />
    </svg>
  );
}
