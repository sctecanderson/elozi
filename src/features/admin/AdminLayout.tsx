import { useState, useEffect, useRef } from "react";
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
import { useTheme } from "../theme/ThemeContext";
import { AdminTopbar } from "./AdminTopbar";
import { getPlatformAccess } from "../platform/platformRestaurants";

export function AdminLayout() {
  const access = useOutletContext<StaffAccess>();
  const { restaurant: r } = useRestaurant();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [restaurantMenuOpen, setRestaurantMenuOpen] = useState(false);
  const restaurantMenuRef = useRef<HTMLDivElement>(null);

  // Define o modo claro como padrão no Admin ao carregar, a menos que haja preferência explícita
  useEffect(() => {
    try {
      const saved = localStorage.getItem('elozi_admin_theme_preference');
      if (saved === 'dark' || saved === 'light') {
        setTheme(saved);
      } else {
        setTheme('light');
      }
    } catch {
      setTheme('light');
    }
  }, [setTheme]);

  // Salva preferência ao mudar de tema no Admin
  useEffect(() => {
    try {
      localStorage.setItem('elozi_admin_theme_preference', theme);
    } catch {}
  }, [theme]);

  const isDark = theme === 'dark';

  // Fechar dropdown do card do restaurante ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        restaurantMenuRef.current &&
        !restaurantMenuRef.current.contains(event.target as Node)
      ) {
        setRestaurantMenuOpen(false);
      }
    }
    if (restaurantMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [restaurantMenuOpen]);

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

  // Mantém os itens originais do menu lateral (removidos: Atendimento, Minha conta e Sair)
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

  return (
    <div
      className={`admin-app ${sidebarCollapsed ? 'sidebar-collapsed' : ''} print:block print:p-0 print:m-0 print:bg-white print:overflow-visible transition-colors duration-200`}
      style={{
        backgroundColor: isDark ? '#121212' : '#F8F9FA',
      }}
    >
      <a href="#admin-content" className="skip-link print:hidden">
        Pular para o conteúdo
      </a>

      {/* SIDEBAR GLOBAL DO ADMIN */}
      <aside
        className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''} print:hidden transition-all duration-200`}
        style={{
          backgroundColor: isDark ? '#18181b' : '#610000',
          borderColor: isDark ? '#27272a' : '#4a0000',
        }}
      >
        {/* Topo da Sidebar: Logo Eloozi branca */}
        <div className="admin-sidebar-header flex items-center justify-between gap-2 mb-6">
          <Link
            to={`/${r.slug}/admin`}
            className="admin-logo inline-flex items-center min-w-0 flex-1 overflow-hidden"
            title="Painel Elozi"
          >
            <img
              src="/landing/Eloozi.png"
              alt="Elozi"
              className="h-8 w-auto object-contain brightness-0 invert"
            />
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            className="admin-sidebar-toggle text-white hover:bg-white/20 transition-colors"
            style={{
              borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.25)',
              background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)',
            }}
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

        {/* Itens de Navegação */}
        <nav aria-label="Administração" className="flex flex-col gap-1.5 flex-1">
          {links.map(([path, label, icon]) => (
            <NavLink
              end
              key={path}
              to={`/${r.slug}/admin${path ? `/${path}` : ""}`}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-3 min-h-[42px] px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? isDark
                      ? '!bg-zinc-800 !text-white !font-bold shadow-xs !shadow-none [&>svg]:!text-white'
                      : '!bg-white !text-[#610000] !font-bold shadow-sm !shadow-none [&>svg]:!text-[#610000]'
                    : isDark
                      ? '!text-zinc-400 hover:!text-white hover:!bg-zinc-800/60 [&>svg]:!text-zinc-400 hover:[&>svg]:!text-white'
                      : '!text-white/85 hover:!text-white hover:!bg-white/10 [&>svg]:!text-white/85 hover:[&>svg]:!text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <AdminIcon
                    name={icon}
                    style={{
                      color: isActive ? (!isDark ? '#610000' : '#ffffff') : (isDark ? '#a1a1aa' : 'rgba(255,255,255,0.85)'),
                    }}
                  />
                  <span className="truncate">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Rodapé da Sidebar: Novo Card do Restaurante */}
        <div ref={restaurantMenuRef} className="mt-auto pt-4 relative">
          {restaurantMenuOpen && (
            <div
              className={`absolute bottom-full left-0 mb-2 w-full min-w-[210px] rounded-xl shadow-xl border p-1.5 z-50 transition-all ${
                isDark
                  ? 'bg-zinc-900 border-zinc-700 text-white shadow-black/50'
                  : 'bg-white border-zinc-200 text-zinc-900 shadow-zinc-900/15'
              }`}
            >
              <Link
                to={`/${r.slug}/equipe`}
                onClick={() => setRestaurantMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                  isDark
                    ? 'hover:bg-zinc-800 text-zinc-200 hover:text-white'
                    : 'hover:bg-zinc-100 text-zinc-700 hover:text-[#610000]'
                }`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <span>Ir para Atendimento</span>
              </Link>
              <Link
                to={`/${r.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setRestaurantMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                  isDark
                    ? 'hover:bg-zinc-800 text-zinc-200 hover:text-white'
                    : 'hover:bg-zinc-100 text-zinc-700 hover:text-[#610000]'
                }`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                <span>Ver Cardápio</span>
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={() => setRestaurantMenuOpen((prev) => !prev)}
            className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left cursor-pointer ${
              isDark
                ? 'bg-zinc-900/80 border-zinc-800 hover:bg-zinc-800 text-white'
                : 'bg-white/10 border-white/15 hover:bg-white/20 text-white'
            }`}
            title={r.name}
            aria-label={`Menu de ${r.name}`}
          >
            {/* Avatar / Logo do Restaurante */}
            <div className="w-9 h-9 rounded-lg bg-white/20 border border-white/25 flex items-center justify-center shrink-0 overflow-hidden text-xs font-bold uppercase text-white">
              {r.logo ? (
                <img src={r.logo.url} alt={r.name} className="w-full h-full object-cover" />
              ) : (
                <span>{r.name.slice(0, 2)}</span>
              )}
            </div>

            {!sidebarCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate leading-tight text-white">{r.name}</p>
                  <span className="text-[10px] text-white/70 block truncate">Restaurante</span>
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`shrink-0 text-white/80 transition-transform ${restaurantMenuOpen ? 'rotate-90' : ''}`}
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ÁREA DE CONTEÚDO PRINCIPAL (WORKSPACE) */}
      <div
        className="admin-workspace print:p-0 print:m-0 print:w-full print:block transition-colors duration-200"
        style={{
          backgroundColor: isDark ? '#121212' : '#F8F9FA',
        }}
      >
        <AdminTopbar restaurant={r} />

        {/* Avisos de Faturamento / Assinatura */}
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

        <main id="admin-content" className="print:p-0 print:m-0 print:w-full print:block px-4 sm:px-6 lg:px-8 pt-[10px] pb-8">
          {isSevereOverdue && !isBillingTab ? (
            <div
              className="p-8 max-w-xl mx-auto my-12 text-center rounded-2xl border"
              style={{
                background: isDark ? "#18181b" : "#ffffff",
                borderColor: isDark ? "#27272a" : "#e5e7eb",
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
              <h2 className="text-xl font-bold mb-2 text-zinc-900 dark:text-white">
                Acesso Administrativo Suspenso
              </h2>
              <p className="text-sm mb-6 leading-relaxed text-zinc-600 dark:text-zinc-400">
                O período de tolerância de 3 dias expirou e a assinatura deste restaurante está suspensa.
                Para restabelecer imediatamente as operações de salão, comandas e visualização da cozinha, efetue o pagamento da fatura em aberto.
              </p>
              <Link
                to={`/${r.slug}/admin/assinatura`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
                style={{ background: "#dc2626" }}
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

export function AdminIcon({
  name,
  className = "",
  style,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) {
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
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ color: "inherit", ...style }}
      aria-hidden="true"
    >
      <path d={paths[name] || paths.menu} />
    </svg>
  );
}
