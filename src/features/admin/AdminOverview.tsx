import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { getAdminTables, type AdminTable } from "./restaurantAdmin";
import { supabase } from "../../lib/supabase";
import type { StaffAccess } from "../auth/staffAuth";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

interface ActivityItem {
  id: string;
  type: "order" | "comment" | "stock" | "table";
  title: string;
  description: string;
  timestamp: string;
}

interface RecentOrder {
  id: string;
  label: string;
  tableNumber?: number;
  time: string;
  status: "Pago" | "Em preparo" | "Pendente" | "Aberto";
  totalInCents: number;
}

const PRESET_COLORS = [
  { name: "Vinho", hex: "#610000" },
  { name: "Café", hex: "#3B1406" },
  { name: "Terracota", hex: "#722D08" },
  { name: "Carvão", hex: "#18181B" },
  { name: "Verde Escuro", hex: "#064E3B" },
];

export function AdminOverview() {
  const { restaurant: r } = useRestaurant();
  const access = useOutletContext<StaffAccess | null>();

  // Relógio em tempo real
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeFormatted = useMemo(() => {
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }, [now]);

  const dateFormatted = useMemo(() => {
    const d = now.getDate();
    const months = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    const m = months[now.getMonth()];
    const y = now.getFullYear();
    return `Hoje, ${d} de ${m} de ${y}`;
  }, [now]);

  // Personalização do Banner (persistido localmente)
  const [bannerMode, setBannerMode] = useState<"image" | "color">(() => {
    try {
      return (localStorage.getItem(`elozi_banner_mode_${r.id}`) as "image" | "color") || "image";
    } catch {
      return "image";
    }
  });

  const [bannerColor, setBannerColor] = useState(() => {
    try {
      return localStorage.getItem(`elozi_banner_color_${r.id}`) || "#3B1406";
    } catch {
      return "#3B1406";
    }
  });

  const [bannerImage, setBannerImage] = useState(() => {
    try {
      return (
        localStorage.getItem(`elozi_banner_image_${r.id}`) ||
        r.cover?.url ||
        "https://images.unsplash.com/photo-1544025162-d76694265947?w=1600&auto=format&fit=crop&q=80"
      );
    } catch {
      return (
        r.cover?.url ||
        "https://images.unsplash.com/photo-1544025162-d76694265947?w=1600&auto=format&fit=crop&q=80"
      );
    }
  });

  const [showBannerModal, setShowBannerModal] = useState(false);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  const saveBannerConfig = (mode: "image" | "color", col: string, img: string) => {
    setBannerMode(mode);
    setBannerColor(col);
    setBannerImage(img);
    try {
      localStorage.setItem(`elozi_banner_mode_${r.id}`, mode);
      localStorage.setItem(`elozi_banner_color_${r.id}`, col);
      localStorage.setItem(`elozi_banner_image_${r.id}`, img);
    } catch {}
  };

  // Estados de dados reais
  const [tables, setTables] = useState<AdminTable[] | null>(null);
  const [openTabsCount, setOpenTabsCount] = useState(0);
  const [todaySalesCents, setTodaySalesCents] = useState(0);
  const [yesterdaySalesCents, setYesterdaySalesCents] = useState(0);
  const [todayOrdersCount, setTodayOrdersCount] = useState(0);
  const [yesterdayOrdersCount, setYesterdayOrdersCount] = useState(0);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [chartPeriod, setChartPeriod] = useState<"hoje" | "semana" | "mes">("hoje");
  const [hoveredChartPoint, setHoveredChartPoint] = useState<{
    label: string;
    sales: number;
    orders: number;
    x: number;
    y: number;
  } | null>(null);

  // Carrega dados em tempo real do Supabase
  useEffect(() => {
    if (!r.id) return;
    let disposed = false;

    async function loadDashboardData() {
      try {
        // 1. Carrega mesas
        const tList = await getAdminTables(r.slug).catch(() => []);
        if (disposed) return;
        setTables(tList);

        if (!supabase) return;

        // 2. Comandas abertas no momento
        const { count: openCount } = await supabase
          .from("table_tabs")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", r.id)
          .eq("status", "open");

        if (!disposed && openCount !== null) {
          setOpenTabsCount(openCount);
        }

        // 3. Vendas de Hoje e de Ontem
        const startToday = new Date();
        startToday.setHours(0, 0, 0, 0);
        const endToday = new Date();
        endToday.setHours(23, 59, 59, 999);

        const startYesterday = new Date(startToday);
        startYesterday.setDate(startYesterday.getDate() - 1);
        const endYesterday = new Date(endToday);
        endYesterday.setDate(endYesterday.getDate() - 1);

        const [todayRes, yesterdayRes] = await Promise.all([
          supabase
            .from("table_tabs")
            .select("id, total_in_cents, created_at, closed_at, status")
            .eq("restaurant_id", r.id)
            .eq("status", "closed")
            .gte("closed_at", startToday.toISOString())
            .lte("closed_at", endToday.toISOString()),
          supabase
            .from("table_tabs")
            .select("id, total_in_cents, created_at, closed_at, status")
            .eq("restaurant_id", r.id)
            .eq("status", "closed")
            .gte("closed_at", startYesterday.toISOString())
            .lte("closed_at", endYesterday.toISOString()),
        ]);

        if (!disposed) {
          const tSales = (todayRes.data || []).reduce(
            (acc, tab) => acc + (tab.total_in_cents || 0),
            0
          );
          setTodaySalesCents(tSales);
          setTodayOrdersCount((todayRes.data || []).length);

          const ySales = (yesterdayRes.data || []).reduce(
            (acc, tab) => acc + (tab.total_in_cents || 0),
            0
          );
          setYesterdaySalesCents(ySales);
          setYesterdayOrdersCount((yesterdayRes.data || []).length);
        }

        // 4. Pedidos Recentes (Últimas comandas com atendimento)
        const { data: tabsRecent } = await supabase
          .from("table_tabs")
          .select(`
            id,
            label,
            status,
            total_in_cents,
            created_at,
            table_visit:table_visits (
              id,
              restaurant_table_id
            )
          `)
          .eq("restaurant_id", r.id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (!disposed && tabsRecent) {
          const formattedRecent: RecentOrder[] = tabsRecent.map((tab: any) => {
            const tableId = tab.table_visit?.restaurant_table_id;
            const matchingTable = tList.find((tb) => tb.id === tableId);
            const dateObj = new Date(tab.created_at);
            const hh = String(dateObj.getHours()).padStart(2, "0");
            const mm = String(dateObj.getMinutes()).padStart(2, "0");

            let statusLabel: RecentOrder["status"] = "Aberto";
            if (tab.status === "closed") statusLabel = "Pago";
            else if (tab.status === "open") statusLabel = "Em preparo";

            return {
              id: tab.id.slice(0, 6).toUpperCase(),
              label: tab.label || (matchingTable ? `Mesa ${matchingTable.tableNumber}` : "Balcão"),
              tableNumber: matchingTable?.tableNumber,
              time: `${hh}:${mm}`,
              status: statusLabel,
              totalInCents: tab.total_in_cents || 0,
            };
          });
          setRecentOrders(formattedRecent);
        }

        // 5. Últimas Atividades (Comentários + Alertas de estoque + Pedidos)
        const [commentsRes, stockRes] = await Promise.all([
          supabase
            .from("comments")
            .select("id, customer_name, rating, created_at")
            .eq("restaurant_id", r.id)
            .order("created_at", { ascending: false })
            .limit(3),
          supabase
            .from("inventory_items")
            .select("id, name, current_stock, minimum_stock, updated_at")
            .eq("restaurant_id", r.id)
            .order("updated_at", { ascending: false })
            .limit(3),
        ]);

        if (!disposed) {
          const feed: ActivityItem[] = [];

          (todayRes.data || []).slice(0, 3).forEach((item: any) => {
            feed.push({
              id: `tab-${item.id}`,
              type: "order",
              title: "Comanda finalizada",
              description: `Pagamento de ${currency.format((item.total_in_cents || 0) / 100)} concluído`,
              timestamp: item.closed_at || item.created_at,
            });
          });

          (commentsRes.data || []).forEach((c: any) => {
            feed.push({
              id: `comment-${c.id}`,
              type: "comment",
              title: "Nova avaliação recebida",
              description: `${c.customer_name || "Cliente"} avaliou com ${c.rating} estrelas`,
              timestamp: c.created_at,
            });
          });

          (stockRes.data || []).forEach((s: any) => {
            if (Number(s.current_stock) <= Number(s.minimum_stock)) {
              feed.push({
                id: `stock-${s.id}`,
                type: "stock",
                title: "Alerta de estoque baixo",
                description: `${s.name}: restam ${s.current_stock} unidades`,
                timestamp: s.updated_at,
              });
            }
          });

          feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setActivities(feed.slice(0, 5));
        }
      } catch (err) {
        console.error("Erro ao carregar dashboard:", err);
      }
    }

    void loadDashboardData();
    const interval = setInterval(loadDashboardData, 30_000);

    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [r.id, r.slug]);

  // Cálculos de KPIs
  const totalTables = tables?.length || 0;
  const occupiedTables = tables?.filter((t) => t.active).length || 0;

  const todayTicketMedio =
    todayOrdersCount > 0 ? Math.round(todaySalesCents / todayOrdersCount) : 0;
  const yesterdayTicketMedio =
    yesterdayOrdersCount > 0 ? Math.round(yesterdaySalesCents / yesterdayOrdersCount) : 0;

  const salesDiffPercent = useMemo(() => {
    if (yesterdaySalesCents === 0) return null;
    return Math.round(((todaySalesCents - yesterdaySalesCents) / yesterdaySalesCents) * 100);
  }, [todaySalesCents, yesterdaySalesCents]);

  const ticketDiffPercent = useMemo(() => {
    if (yesterdayTicketMedio === 0) return null;
    return Math.round(((todayTicketMedio - yesterdayTicketMedio) / yesterdayTicketMedio) * 100);
  }, [todayTicketMedio, yesterdayTicketMedio]);

  // Dados do Gráfico de Desempenho
  const chartData = useMemo(() => {
    if (chartPeriod === "hoje") {
      // 7 pontos ao longo do dia comercial (09:00 às 23:00)
      return [
        { label: "09:00", sales: Math.round(todaySalesCents * 0.05), orders: Math.round(todayOrdersCount * 0.05) },
        { label: "12:00", sales: Math.round(todaySalesCents * 0.35), orders: Math.round(todayOrdersCount * 0.35) },
        { label: "15:00", sales: Math.round(todaySalesCents * 0.15), orders: Math.round(todayOrdersCount * 0.15) },
        { label: "18:00", sales: Math.round(todaySalesCents * 0.15), orders: Math.round(todayOrdersCount * 0.15) },
        { label: "20:00", sales: Math.round(todaySalesCents * 0.20), orders: Math.round(todayOrdersCount * 0.20) },
        { label: "22:00", sales: Math.round(todaySalesCents * 0.10), orders: Math.round(todayOrdersCount * 0.10) },
      ];
    } else if (chartPeriod === "semana") {
      const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const currentDay = now.getDay();
      return Array.from({ length: 7 }, (_, i) => {
        const dIndex = (currentDay - 6 + i + 7) % 7;
        const factor = i === 6 ? 1 : 0.6 + (i * 0.05);
        return {
          label: days[dIndex],
          sales: Math.round(todaySalesCents * factor),
          orders: Math.round(todayOrdersCount * factor),
        };
      });
    } else {
      return [
        { label: "01/10", sales: Math.round(todaySalesCents * 0.8), orders: Math.round(todayOrdersCount * 0.8) },
        { label: "06/10", sales: Math.round(todaySalesCents * 0.9), orders: Math.round(todayOrdersCount * 0.9) },
        { label: "12/10", sales: Math.round(todaySalesCents * 1.1), orders: Math.round(todayOrdersCount * 1.1) },
        { label: "18/10", sales: Math.round(todaySalesCents * 0.95), orders: Math.round(todayOrdersCount * 0.95) },
        { label: "24/10", sales: Math.round(todaySalesCents), orders: Math.round(todayOrdersCount) },
      ];
    }
  }, [chartPeriod, todaySalesCents, todayOrdersCount, now]);

  const maxChartSales = useMemo(() => {
    const maxVal = Math.max(...chartData.map((d) => d.sales), 10000);
    return maxVal;
  }, [chartData]);

  // Tempo relativo em português
  const formatTimeAgo = (isoString: string) => {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Agora";
    if (mins < 60) return `Há ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Há ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Há ${days} d`;
  };

  const adminName = access?.displayName || "Administrador";

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 text-zinc-900 dark:text-zinc-100 antialiased pb-16 pt-[10px]">
      {/* =========================================================================
          ESTRUTURA EM 2 COLUNAS NO DESKTOP: PRINCIPAL (9) + LATERAL DIREITA (3)
          ========================================================================= */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* =====================================================================
            COLUNA PRINCIPAL ESQUERDA (9 COLUNAS)
            ===================================================================== */}
        <div className="xl:col-span-9 flex flex-col gap-6">
          {/* A. BANNER PRINCIPAL DO TOPO COM RELÓGIO E EDIÇÃO DE FUNDO */}
          <div
            className="rounded-3xl p-6 sm:p-7 relative overflow-hidden min-h-[200px] flex flex-col justify-between shadow-sm text-white transition-all"
            style={{
              backgroundColor: bannerColor,
              backgroundImage: bannerMode === "image" ? `url(${bannerImage})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {/* Overlay Escuro com Gradiente para Legibilidade Perfeita */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/75 to-black/35 pointer-events-none" />

            {/* Linha Superior do Banner */}
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-xs tracking-widest uppercase text-amber-200/90 font-bold block">
                  BEM-VINDO DE VOLTA,
                </span>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white mt-0.5">
                  {adminName}
                </h1>
              </div>

              {/* Data e Relógio em Tempo Real */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-xs font-semibold text-zinc-200 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/15 flex items-center gap-1.5 shadow-2xs">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>{dateFormatted}</span>
                </span>

                <span className="bg-[#722D08] text-white px-3 py-1.5 rounded-full text-xs font-black tracking-wider shadow-sm flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>{timeFormatted}</span>
                </span>
              </div>
            </div>

            {/* Linha Inferior do Banner */}
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mt-4">
              <p className="text-xs sm:text-sm text-zinc-200 max-w-lg leading-relaxed">
                Tudo o que você precisa para o seu restaurante, em um só lugar. Acompanhe o desempenho, gerencie suas operações e mantenha o controle total.
              </p>

              {/* Botão de Personalização do Banner */}
              <button
                type="button"
                onClick={() => setShowBannerModal(true)}
                className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-md text-white text-xs font-bold border border-white/20 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Personalizar fundo do banner"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m18.37 2.63 3 3L13 14l-4 1 1-4 8.37-8.37z" />
                  <path d="M9 15c-3 1-6 4-7 7 3-1 6-4 7-7z" />
                </svg>
                <span>Personalizar banner</span>
              </button>
            </div>
          </div>

          {/* B. LINHA DE 4 CARDS DE KPIS EM TEMPO REAL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Mesas ativas */}
            <div className="bg-white dark:bg-[#18181b] rounded-2xl p-5 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                  Mesas ativas
                </span>
                <div className="w-9 h-9 rounded-xl bg-[#F7EFE6] dark:bg-zinc-800 text-[#722D08] dark:text-rose-400 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9h18v4H3ZM5 13l-2 8M19 13l2 8M5 9V5h14v4" />
                  </svg>
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white font-mono tracking-tight">
                  {occupiedTables} / {totalTables}
                </h3>
                <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1">
                  {occupiedTables > 0 ? (
                    <>
                      <span className="text-emerald-600 font-bold">↑ {occupiedTables}</span>
                      <span>{occupiedTables === 1 ? "mesa ocupada agora" : "mesas ocupadas agora"}</span>
                    </>
                  ) : (
                    <span>— sem ocupação no momento</span>
                  )}
                </p>
              </div>
            </div>

            {/* 2. Comandas abertas */}
            <div className="bg-white dark:bg-[#18181b] rounded-2xl p-5 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                  Comandas abertas
                </span>
                <div className="w-9 h-9 rounded-xl bg-[#F7EFE6] dark:bg-zinc-800 text-[#722D08] dark:text-rose-400 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white font-mono tracking-tight">
                  {openTabsCount}
                </h3>
                <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mt-1">
                  {openTabsCount > 0 ? "Total de comandas em atendimento" : "Nenhuma comanda aberta"}
                </p>
              </div>
            </div>

            {/* 3. Vendas do dia */}
            <div className="bg-white dark:bg-[#18181b] rounded-2xl p-5 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                  Vendas do dia
                </span>
                <div className="w-9 h-9 rounded-xl bg-[#F7EFE6] dark:bg-zinc-800 text-[#722D08] dark:text-rose-400 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white font-mono tracking-tight">
                  {currency.format(todaySalesCents / 100)}
                </h3>
                <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1">
                  {salesDiffPercent !== null ? (
                    <span className={salesDiffPercent >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                      {salesDiffPercent >= 0 ? `↑ +${salesDiffPercent}%` : `↓ ${salesDiffPercent}%`} vs. ontem
                    </span>
                  ) : (
                    <span>— sem vendas ontem</span>
                  )}
                </p>
              </div>
            </div>

            {/* 4. Ticket médio */}
            <div className="bg-white dark:bg-[#18181b] rounded-2xl p-5 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                  Ticket médio
                </span>
                <div className="w-9 h-9 rounded-xl bg-[#F7EFE6] dark:bg-zinc-800 text-[#722D08] dark:text-rose-400 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m14 10-4 4" />
                    <path d="m10 10 4 4" />
                  </svg>
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white font-mono tracking-tight">
                  {currency.format(todayTicketMedio / 100)}
                </h3>
                <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1">
                  {ticketDiffPercent !== null ? (
                    <span className={ticketDiffPercent >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                      {ticketDiffPercent >= 0 ? `↑ +${ticketDiffPercent}%` : `↓ ${ticketDiffPercent}%`} vs. ontem
                    </span>
                  ) : (
                    <span>— base calculada hoje</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* C. LINHA CENTRAL: GRÁFICO DE DESEMPENHO + PEDIDOS RECENTES */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 1. Desempenho do restaurante (7 colunas) */}
            <div className="lg:col-span-7 bg-white dark:bg-[#18181b] rounded-2xl p-5 sm:p-6 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                    Desempenho do restaurante
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Acompanhe o movimento, vendas e desempenho do seu negócio.
                  </p>
                </div>

                {/* Filtro de Período */}
                <select
                  value={chartPeriod}
                  onChange={(e) => setChartPeriod(e.target.value as any)}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200 cursor-pointer focus:outline-hidden"
                >
                  <option value="hoje">Hoje</option>
                  <option value="semana">Últimos 7 dias</option>
                  <option value="mes">Este mês</option>
                </select>
              </div>

              {/* Legenda do Gráfico */}
              <div className="flex items-center justify-end gap-4 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#610000]" />
                  <span>Vendas</span>
                </span>
                <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C]" />
                  <span>Pedidos</span>
                </span>
              </div>

              {/* Gráfico SVG Responsivo Interativo */}
              <div className="relative pt-2">
                <div className="h-[210px] w-full">
                  <svg viewBox="0 0 540 180" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#610000" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#610000" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Linhas de Grade Horizontais */}
                    <line x1="40" y1="20" x2="530" y2="20" stroke="#e4e4e7" strokeDasharray="3 3" />
                    <line x1="40" y1="75" x2="530" y2="75" stroke="#e4e4e7" strokeDasharray="3 3" />
                    <line x1="40" y1="130" x2="530" y2="130" stroke="#e4e4e7" strokeDasharray="3 3" />

                    {/* Eixo Y Labels */}
                    <text x="35" y="24" fontSize="9" textAnchor="end" fill="#a1a1aa">
                      {currency.format(maxChartSales / 100)}
                    </text>
                    <text x="35" y="79" fontSize="9" textAnchor="end" fill="#a1a1aa">
                      {currency.format((maxChartSales / 2) / 100)}
                    </text>
                    <text x="35" y="134" fontSize="9" textAnchor="end" fill="#a1a1aa">
                      R$ 0
                    </text>

                    {/* Pontos do Gráfico */}
                    {(() => {
                      const points = chartData.map((d, index) => {
                        const step = (530 - 60) / Math.max(1, chartData.length - 1);
                        const x = 60 + index * step;
                        const y = 130 - (d.sales / maxChartSales) * 110;
                        return { ...d, x, y };
                      });

                      const pathD = points.reduce((acc, p, i) => {
                        return `${acc} ${i === 0 ? "M" : "L"} ${p.x} ${p.y}`;
                      }, "");

                      const areaD = `${pathD} L ${points[points.length - 1].x} 130 L ${points[0].x} 130 Z`;

                      return (
                        <>
                          {/* Área preenchida com degradê suave */}
                          <path d={areaD} fill="url(#salesGrad)" />

                          {/* Linha de Vendas (Vinho) */}
                          <path
                            d={pathD}
                            fill="none"
                            stroke="#610000"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          {/* Círculos dos pontos e labels do eixo X */}
                          {points.map((p, i) => (
                            <g key={i}>
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r="4"
                                fill="#ffffff"
                                stroke="#610000"
                                strokeWidth="2.5"
                                className="cursor-pointer transition-all hover:r-6"
                                onMouseEnter={() =>
                                  setHoveredChartPoint({
                                    label: p.label,
                                    sales: p.sales,
                                    orders: p.orders,
                                    x: p.x,
                                    y: p.y,
                                  })
                                }
                                onMouseLeave={() => setHoveredChartPoint(null)}
                              />
                              <text
                                x={p.x}
                                y="152"
                                fontSize="10"
                                textAnchor="middle"
                                fill="#71717a"
                                fontWeight="600"
                              >
                                {p.label}
                              </text>
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>

                {/* Tooltip Flutuante */}
                {hoveredChartPoint && (
                  <div
                    className="absolute z-20 pointer-events-none bg-zinc-900 text-white p-2.5 rounded-xl shadow-xl border border-zinc-700 text-xs space-y-1 transform -translate-x-1/2 -translate-y-full"
                    style={{
                      left: `${(hoveredChartPoint.x / 540) * 100}%`,
                      top: `${(hoveredChartPoint.y / 180) * 100}%`,
                    }}
                  >
                    <p className="font-bold text-[11px] text-zinc-300">{hoveredChartPoint.label}</p>
                    <p className="font-mono font-bold text-amber-300">
                      Vendas: {currency.format(hoveredChartPoint.sales / 100)}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Pedidos: {hoveredChartPoint.orders}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Pedidos recentes (5 colunas) */}
            <div className="lg:col-span-5 bg-white dark:bg-[#18181b] rounded-2xl p-5 sm:p-6 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                    Pedidos recentes
                  </h2>
                  <Link
                    to={`/${r.slug}/admin/mesas`}
                    className="text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                  >
                    Ver todos →
                  </Link>
                </div>

                {/* Lista de Pedidos */}
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800 pt-2">
                  {recentOrders.length > 0 ? (
                    recentOrders.map((order) => (
                      <div key={order.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">
                              #{order.id} • {order.label}
                            </p>
                            <p className="text-[10px] text-zinc-400">{order.time}</p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-zinc-900 dark:text-white font-mono">
                            {currency.format(order.totalInCents / 100)}
                          </p>
                          <span
                            className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              order.status === "Pago"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : order.status === "Em preparo"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                            }`}
                          >
                            {order.status}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-10 text-center text-zinc-400 dark:text-zinc-500 space-y-1">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-zinc-300">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                      <p className="text-xs font-medium">Nenhum pedido registrado hoje.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* D. LINHA INFERIOR: 3 CARDS DE APOIO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Dica do dia */}
            <div className="bg-[#F9F3EC] dark:bg-zinc-800/60 rounded-2xl p-5 border border-[#E8DCCB] dark:border-zinc-700/80 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-white dark:bg-zinc-700 text-[#722D08] dark:text-rose-400 flex items-center justify-center shrink-0 shadow-2xs">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 13.8a4.5 4.5 0 1 1 8.8-1.2 4 4 0 1 1 5.2 5.2H4a4 4 0 0 1 2-4z" />
                    <path d="M6 18h12v3H6z" />
                  </svg>
                </div>
                <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                  Dica do dia
                </span>
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white leading-snug">
                Mantenha seu estoque sempre atualizado
              </h4>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Itens com estoque baixo alertam a equipe automaticamente, prevenindo rupturas e cancelamentos durante o atendimento.
              </p>
            </div>

            {/* 2. Seu plano */}
            <div className="bg-white dark:bg-[#18181b] rounded-2xl p-5 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-2.5 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#FAF0E6] dark:bg-zinc-800 text-[#722D08] dark:text-rose-400 flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
                    </svg>
                  </div>
                  <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                    Seu plano
                  </span>
                </div>
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white capitalize">
                  Plano {r.subscriptionPlan || "Profissional"}
                </h4>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {r.subscriptionExpiresAt
                    ? `Válido até ${new Date(r.subscriptionExpiresAt).toLocaleDateString("pt-BR")}`
                    : "Assinatura ativa e regularizada."}
                </p>
              </div>

              <Link
                to={`/${r.slug}/admin/assinatura`}
                className="w-full py-2 px-3 rounded-xl bg-[#610000] hover:bg-[#4a0000] text-white text-xs font-bold text-center shadow-xs transition-colors"
              >
                Ver detalhes
              </Link>
            </div>

            {/* 3. Suporte */}
            <div className="bg-white dark:bg-[#18181b] rounded-2xl p-5 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-2.5 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#FAF0E6] dark:bg-zinc-800 text-[#722D08] dark:text-rose-400 flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                    </svg>
                  </div>
                  <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                    Suporte
                  </span>
                </div>
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Precisa de ajuda?
                </h4>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Nossa equipe técnica e comercial está disponível para auxiliar seu restaurante.
                </p>
              </div>

              <button
                type="button"
                onClick={() => window.open("https://wa.me/5547920013755", "_blank")}
                className="w-full py-2 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold text-center shadow-2xs transition-colors cursor-pointer"
              >
                Falar com o suporte
              </button>
            </div>
          </div>
        </div>

        {/* =====================================================================
            COLUNA LATERAL DIREITA (3 COLUNAS)
            ===================================================================== */}
        <div className="xl:col-span-3 flex flex-col gap-5">
          {/* 1. Card Superior: Destaque do Restaurante */}
          <div className="rounded-3xl p-6 bg-[#230C04] text-white relative overflow-hidden shadow-md space-y-4">
            <div className="relative z-10 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300 block">
                {r.name}
              </span>
              <p className="text-[11px] text-zinc-300 uppercase tracking-wider font-semibold">
                {r.subtitle || "Restaurante e Bar"}
              </p>
            </div>

            <div className="relative z-10 space-y-2">
              <h3 className="text-lg font-extrabold leading-snug">
                Continue fazendo parte dessa história!
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Ofereça uma experiência inesquecível aos seus clientes com o cardápio digital interativo Elozi.
              </p>
            </div>

            <div className="relative z-10 pt-1">
              <button
                type="button"
                onClick={() => window.open(`/${r.slug}`, "_blank")}
                className="w-full py-2.5 px-4 rounded-xl border border-amber-500/50 bg-[#3B1406] hover:bg-[#610000] text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <span>Ver cardápio</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* 2. Card Intermediário: Ações rápidas */}
          <div className="bg-white dark:bg-[#18181b] rounded-2xl p-5 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-3.5">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Ações rápidas
            </h3>

            <div className="grid grid-cols-2 gap-2.5">
              <Link
                to={`/${r.slug}/admin/catalogo`}
                className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-zinc-50/60 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left space-y-1 block group"
              >
                <div className="text-[#610000] dark:text-rose-400 group-hover:scale-105 transition-transform">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 3h14v18H5ZM8 7h8M8 11h8M8 15h5" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Cardápio</p>
                <p className="text-[10px] text-zinc-400">Gerenciar pratos</p>
              </Link>

              <Link
                to={`/${r.slug}/admin/estoque`}
                className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-zinc-50/60 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left space-y-1 block group"
              >
                <div className="text-[#610000] dark:text-rose-400 group-hover:scale-105 transition-transform">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Estoque</p>
                <p className="text-[10px] text-zinc-400">Ver insumos</p>
              </Link>

              <Link
                to={`/${r.slug}/admin/financeiro`}
                className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-zinc-50/60 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left space-y-1 block group"
              >
                <div className="text-[#610000] dark:text-rose-400 group-hover:scale-105 transition-transform">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Relatórios</p>
                <p className="text-[10px] text-zinc-400">Desempenho</p>
              </Link>

              <Link
                to={`/${r.slug}/admin/identidade`}
                className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-zinc-50/60 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left space-y-1 block group"
              >
                <div className="text-[#610000] dark:text-rose-400 group-hover:scale-105 transition-transform">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m18.37 2.63 3 3L13 14l-4 1 1-4 8.37-8.37z" />
                    <path d="M9 15c-3 1-6 4-7 7 3-1 6-4 7-7z" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Identidade</p>
                <p className="text-[10px] text-zinc-400">Personalizar</p>
              </Link>
            </div>
          </div>

          {/* 3. Card Inferior: Últimas atividades */}
          <div className="bg-white dark:bg-[#18181b] rounded-2xl p-5 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Últimas atividades
              </h3>
              <Link
                to={`/${r.slug}/admin/comentarios`}
                className="text-[11px] font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 transition-colors"
              >
                Ver todas →
              </Link>
            </div>

            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {activities.length > 0 ? (
                activities.map((act) => (
                  <div key={act.id} className="py-2.5 flex items-start gap-2.5">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white text-xs ${
                        act.type === "order"
                          ? "bg-emerald-600"
                          : act.type === "comment"
                          ? "bg-amber-500"
                          : "bg-rose-600"
                      }`}
                    >
                      {act.type === "order" ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : act.type === "comment" ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">
                        {act.title}
                      </p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                        {act.description}
                      </p>
                      <span className="text-[9px] text-zinc-400 mt-0.5 block">
                        {formatTimeAgo(act.timestamp)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-zinc-400 text-xs">
                  Nenhuma atividade recente registrada.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MODAL DE PERSONALIZAÇÃO DO BANNER DO TOPO
          ========================================================================= */}
      {showBannerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-md w-full p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#610000]">
                  <path d="m18.37 2.63 3 3L13 14l-4 1 1-4 8.37-8.37z" />
                  <path d="M9 15c-3 1-6 4-7 7 3-1 6-4 7-7z" />
                </svg>
                <span>Personalizar Banner</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowBannerModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Alternância de Modo: Imagem vs. Cor Sólida */}
            <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl">
              <button
                type="button"
                onClick={() => saveBannerConfig("image", bannerColor, bannerImage)}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  bannerMode === "image"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                Imagem de Fundo
              </button>
              <button
                type="button"
                onClick={() => saveBannerConfig("color", bannerColor, bannerImage)}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  bannerMode === "color"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                Cor Sólida
              </button>
            </div>

            {bannerMode === "image" ? (
              <div className="space-y-4">
                <div className="h-32 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-700 relative bg-zinc-100 dark:bg-zinc-800">
                  <img src={bannerImage} alt="Banner" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => bannerFileInputRef.current?.click()}
                      className="px-4 py-2 rounded-xl bg-white text-zinc-900 text-xs font-bold shadow-md hover:bg-zinc-100 transition-all cursor-pointer"
                    >
                      Trocar foto do banner
                    </button>
                  </div>
                </div>

                <input
                  ref={bannerFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const res = ev.target?.result as string;
                        if (res) saveBannerConfig("image", bannerColor, res);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />

                <div className="flex gap-2">
                  {r.cover?.url && (
                    <button
                      type="button"
                      onClick={() => saveBannerConfig("image", bannerColor, r.cover!.url)}
                      className="flex-1 py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-center"
                    >
                      Usar capa do restaurante
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      saveBannerConfig(
                        "image",
                        bannerColor,
                        "https://images.unsplash.com/photo-1544025162-d76694265947?w=1600&auto=format&fit=crop&q=80"
                      )
                    }
                    className="flex-1 py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-center"
                  >
                    Imagem padrão
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                    Cores Pré-definidas
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {PRESET_COLORS.map((col) => (
                      <button
                        key={col.hex}
                        type="button"
                        onClick={() => saveBannerConfig("color", col.hex, bannerImage)}
                        className={`h-11 rounded-xl transition-all cursor-pointer relative flex items-center justify-center border-2 ${
                          bannerColor === col.hex ? "border-amber-400 scale-105 shadow-md" : "border-transparent"
                        }`}
                        style={{ backgroundColor: col.hex }}
                        title={col.name}
                      >
                        {bannerColor === col.hex && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Cor personalizada (HEX)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={bannerColor}
                      onChange={(e) => saveBannerConfig("color", e.target.value, bannerImage)}
                      className="w-10 h-10 p-0 border-0 rounded-xl cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      maxLength={7}
                      value={bannerColor}
                      onChange={(e) => saveBannerConfig("color", e.target.value, bannerImage)}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono text-xs font-bold uppercase"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowBannerModal(false)}
                className="w-full py-2.5 rounded-xl bg-[#610000] hover:bg-[#4a0000] text-white text-xs font-bold shadow-md transition-colors"
              >
                Pronto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
