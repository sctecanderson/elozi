import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams, useLocation } from "react-router";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { printThermalReceipt, ThermalPrinterIcon } from "../../components/ThermalReceiptPrint";

// ============================================================================
// TIPAGENS DO MÓDULO FINANCEIRO
// ============================================================================

export interface TopProductItem {
  product_name: string;
  quantity_sold?: number;
  total_quantity?: number;
  total_revenue_cents: number;
}

export interface DailyBreakdownItem {
  date?: string;
  day?: string;
  tabs_count: number;
  revenue_cents: number;
}

export interface FinancialReportData {
  restaurant_id: string;
  period_start: string;
  period_end: string;
  gross_revenue_cents: number;
  estimated_service_fee_cents: number;
  closed_tabs_count: number;
  average_ticket_cents: number;
  cancelled_items_count: number;
  cancelled_amount_cents: number;
  top_products: TopProductItem[];
  daily_breakdown: DailyBreakdownItem[];
}

export interface CashMovementItem {
  id: string;
  restaurant_id: string;
  type: "entrada" | "saida";
  category: "venda" | "suprimento" | "sangria" | "despesa" | "outro";
  description: string;
  amount_cents: number;
  payment_method: "pix" | "credit" | "debit" | "cash" | "other";
  created_at: string;
  user_name: string;
  status: "confirmado" | "pendente" | "cancelado";
  tab_id?: string;
}

export interface CashRegisterClosure {
  id: string;
  restaurant_id: string;
  closed_at: string;
  shift: "all" | "morning" | "night";
  operator_name: string;
  total_sales_cents: number;
  total_service_fee_cents: number;
  total_discounts_cents: number;
  total_received_cents: number;
  cash_cents: number;
  cards_cents: number;
  pix_cents: number;
  tabs_count: number;
  notes?: string;
}

type PeriodPreset = "today" | "7d" | "30d" | "month" | "custom";
type ShiftFilter = "all" | "morning" | "night";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatCents(cents: number): string {
  return currencyFormatter.format((cents || 0) / 100);
}

function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function computePresetDates(preset: Exclude<PeriodPreset, "custom">): { start: string; end: string } {
  const now = new Date();
  const end = toLocalDateInputValue(now);

  if (preset === "today") {
    return { start: end, end };
  }
  if (preset === "7d") {
    const startObj = new Date(now);
    startObj.setDate(now.getDate() - 6);
    return { start: toLocalDateInputValue(startObj), end };
  }
  if (preset === "30d") {
    const startObj = new Date(now);
    startObj.setDate(now.getDate() - 29);
    return { start: toLocalDateInputValue(startObj), end };
  }
  // month
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toLocalDateInputValue(startMonth), end };
}

function getPaymentMethodLabel(method: string): string {
  switch (method) {
    case "credit":
      return "Cartão de crédito";
    case "debit":
      return "Cartão de débito";
    case "cash":
      return "Dinheiro";
    case "pix":
      return "Pix";
    default:
      return "Outros";
  }
}

function getPaymentMethodColor(method: string): string {
  switch (method) {
    case "pix":
      return "#06b6d4"; // cyan
    case "credit":
      return "#8b5cf6"; // purple
    case "debit":
      return "#3b82f6"; // blue
    case "cash":
      return "#10b981"; // emerald
    default:
      return "#71717a"; // zinc
  }
}

export function FinancialReportPage() {
  const { restaurant: r } = useRestaurant();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Controle de Visualização: 'relatorio' (Visão 1) ou 'fechamento' (Visão 2)
  const activeView = useMemo(() => {
    if (searchParams.get("tab") === "fechamento" || location.pathname.includes("fechamento")) {
      return "fechamento";
    }
    return "relatorio";
  }, [searchParams, location.pathname]);

  const switchView = (nextView: "relatorio" | "fechamento") => {
    setSearchParams({ tab: nextView });
  };

  // Filtros de Período e Turno
  const [preset, setPreset] = useState<PeriodPreset>("today");
  const initialDates = useMemo(() => computePresetDates("today"), []);
  const [startDate, setStartDate] = useState<string>(initialDates.start);
  const [endDate, setEndDate] = useState<string>(initialDates.end);
  const [selectedShift, setSelectedShift] = useState<ShiftFilter>("all");

  // Estado de Dados do Relatório
  const [report, setReport] = useState<FinancialReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");

  // Fechamentos de Caixa Persistentes no Storage do Restaurante
  const [closures, setClosures] = useState<CashRegisterClosure[]>(() => {
    try {
      if (!r?.id) return [];
      const saved = localStorage.getItem(`elozi_caixa_fechamentos_${r.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Movimentações Manuais de Caixa (Sangrias, Suprimentos, Despesas)
  const [manualMovements, setManualMovements] = useState<CashMovementItem[]>(() => {
    try {
      if (!r?.id) return [];
      const saved = localStorage.getItem(`elozi_caixa_movimentacoes_${r.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Comandas Fechadas Reais do Supabase para o Período
  const [closedTabs, setClosedTabs] = useState<any[]>([]);

  // Sincroniza Fechamentos no LocalStorage
  useEffect(() => {
    if (r?.id) {
      localStorage.setItem(`elozi_caixa_fechamentos_${r.id}`, JSON.stringify(closures));
    }
  }, [closures, r?.id]);

  // Sincroniza Movimentações Manuais no LocalStorage
  useEffect(() => {
    if (r?.id) {
      localStorage.setItem(`elozi_caixa_movimentacoes_${r.id}`, JSON.stringify(manualMovements));
    }
  }, [manualMovements, r?.id]);

  // Modais de Apoio
  const [isClosureModalOpen, setIsClosureModalOpen] = useState(false);
  const [isNewMovementModalOpen, setIsNewMovementModalOpen] = useState(false);
  const [quickReportModal, setQuickReportModal] = useState<
    "vendas" | "ticket" | "produtos" | "comissao" | null
  >(null);

  // Formulário de Novo Fechamento
  const [closureOperator, setClosureOperator] = useState("Gerente / Caixa");
  const [closureNotes, setClosureNotes] = useState("");
  const [closureBusy, setClosureBusy] = useState(false);

  // Formulário de Nova Movimentação Manual
  const [movType, setMovType] = useState<"entrada" | "saida">("saida");
  const [movCategory, setMovCategory] = useState<"venda" | "suprimento" | "sangria" | "despesa" | "outro">("sangria");
  const [movDescription, setMovDescription] = useState("");
  const [movAmount, setMovAmount] = useState("");
  const [movPaymentMethod, setMovPaymentMethod] = useState<"pix" | "credit" | "debit" | "cash" | "other">("cash");

  // Filtros da Tabela de Movimentações
  const [movTypeFilter, setMovTypeFilter] = useState<"all" | "entrada" | "saida">("all");
  const [movPaymentFilter, setMovPaymentFilter] = useState<string>("all");
  const [movSearch, setMovSearch] = useState<string>("");
  const [movCurrentPage, setMovCurrentPage] = useState<number>(1);
  const movPageSize = 8;

  // Evolução do Faturamento: Filtro 7d ou 30d
  const [chartRange, setChartRange] = useState<"7d" | "30d">("7d");

  // Aplica Preset de Datas
  const applyPreset = (nextPreset: Exclude<PeriodPreset, "custom">) => {
    setPreset(nextPreset);
    const { start, end } = computePresetDates(nextPreset);
    setStartDate(start);
    setEndDate(end);
    setMovCurrentPage(1);
  };

  // Carrega Relatório e Dados Contábeis do Supabase
  const fetchReport = useCallback(async () => {
    if (!r?.id) return;
    setLoading(true);
    setError(null);

    try {
      const startIso = new Date(`${startDate}T00:00:00`).toISOString();
      const endIso = new Date(`${endDate}T23:59:59.999`).toISOString();

      if (!supabase) {
        setReport({
          restaurant_id: r.id,
          period_start: startIso,
          period_end: endIso,
          gross_revenue_cents: 0,
          estimated_service_fee_cents: 0,
          closed_tabs_count: 0,
          average_ticket_cents: 0,
          cancelled_items_count: 0,
          cancelled_amount_cents: 0,
          top_products: [],
          daily_breakdown: [],
        });
        setClosedTabs([]);
        return;
      }

      // 1. Chama RPC get_restaurant_financial_report
      const { data, error: rpcError } = await supabase.rpc("get_restaurant_financial_report", {
        p_restaurant_id: r.id,
        p_start_date: startIso,
        p_end_date: endIso,
      });

      if (rpcError) {
        throw rpcError;
      }

      const parsed = data as FinancialReportData;
      setReport({
        restaurant_id: parsed?.restaurant_id ?? r.id,
        period_start: parsed?.period_start ?? startIso,
        period_end: parsed?.period_end ?? endIso,
        gross_revenue_cents: Number(parsed?.gross_revenue_cents ?? 0),
        estimated_service_fee_cents: Number(parsed?.estimated_service_fee_cents ?? 0),
        closed_tabs_count: Number(parsed?.closed_tabs_count ?? 0),
        average_ticket_cents: Number(parsed?.average_ticket_cents ?? 0),
        cancelled_items_count: Number(parsed?.cancelled_items_count ?? 0),
        cancelled_amount_cents: Number(parsed?.cancelled_amount_cents ?? 0),
        top_products: Array.isArray(parsed?.top_products) ? parsed.top_products : [],
        daily_breakdown: Array.isArray(parsed?.daily_breakdown) ? parsed.daily_breakdown : [],
      });

      // 2. Consulta comandas fechadas reais para a tabela de movimentações
      const { data: tabsData, error: tabsError } = await supabase
        .from("table_tabs")
        .select("id, label, created_at, closed_at, subtotal_in_cents, service_fee_in_cents, total_in_cents, service_fee_accepted")
        .eq("restaurant_id", r.id)
        .eq("status", "closed")
        .gte("closed_at", startIso)
        .lte("closed_at", endIso)
        .order("closed_at", { ascending: false });

      if (!tabsError && tabsData) {
        setClosedTabs(tabsData);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar relatório financeiro.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [r?.id, startDate, endDate]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  // ==========================================================================
  // CONSOLIDAÇÃO DINÂMICA DE TODAS AS MOVIMENTAÇÕES (100% DADOS REAIS)
  // ==========================================================================
  const allMovements = useMemo(() => {
    const list: CashMovementItem[] = [];

    // 1. Comandas fechadas vindas do Supabase (Entradas de Vendas)
    closedTabs.forEach((tab) => {
      // Tenta recuperar método de pagamento salvo para esta comanda
      let method: CashMovementItem["payment_method"] = "pix";
      try {
        const savedMethod = localStorage.getItem(`elozi_tab_payment_${tab.id}`);
        if (savedMethod && ["pix", "credit", "debit", "cash", "other"].includes(savedMethod)) {
          method = savedMethod as any;
        }
      } catch {}

      const amountCents = Number(tab.total_in_cents || tab.subtotal_in_cents || 0);

      list.push({
        id: `tab-${tab.id}`,
        restaurant_id: r?.id || "",
        type: "entrada",
        category: "venda",
        description: `Encerramento Comanda: ${tab.label || "Consumo"}`,
        amount_cents: amountCents,
        payment_method: method,
        created_at: tab.closed_at || tab.created_at || new Date().toISOString(),
        user_name: "Operador de Caixa",
        status: "confirmado",
        tab_id: tab.id,
      });
    });

    // 2. Movimentações Manuais (Sangrias, Suprimentos, etc.)
    const startIso = new Date(`${startDate}T00:00:00`).getTime();
    const endIso = new Date(`${endDate}T23:59:59.999`).getTime();

    manualMovements.forEach((mov) => {
      const movTime = new Date(mov.created_at).getTime();
      if (movTime >= startIso && movTime <= endIso) {
        list.push(mov);
      }
    });

    // Ordenação decrescente por data/hora
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [closedTabs, manualMovements, startDate, endDate, r?.id]);

  // Filtragem e Paginação da Tabela de Movimentações
  const filteredMovements = useMemo(() => {
    return allMovements.filter((m) => {
      if (movTypeFilter !== "all" && m.type !== movTypeFilter) return false;
      if (movPaymentFilter !== "all" && m.payment_method !== movPaymentFilter) return false;
      if (movSearch.trim()) {
        const q = movSearch.toLowerCase().trim();
        const matchDesc = m.description.toLowerCase().includes(q);
        const matchUser = m.user_name.toLowerCase().includes(q);
        const matchMethod = getPaymentMethodLabel(m.payment_method).toLowerCase().includes(q);
        const matchVal = (m.amount_cents / 100).toFixed(2).includes(q);
        if (!matchDesc && !matchUser && !matchMethod && !matchVal) return false;
      }
      return true;
    });
  }, [allMovements, movTypeFilter, movPaymentFilter, movSearch]);

  const totalMovPages = Math.max(1, Math.ceil(filteredMovements.length / movPageSize));
  const paginatedMovements = useMemo(() => {
    const start = (movCurrentPage - 1) * movPageSize;
    return filteredMovements.slice(start, start + movPageSize);
  }, [filteredMovements, movCurrentPage, movPageSize]);

  // ==========================================================================
  // CÁLCULOS TOTAIS E MÉTODOS DE PAGAMENTO (100% REAIS)
  // ==========================================================================
  const totalEntradasCents = useMemo(() => {
    return allMovements
      .filter((m) => m.type === "entrada" && m.status === "confirmado")
      .reduce((acc, curr) => acc + curr.amount_cents, 0);
  }, [allMovements]);

  const totalSaidasCents = useMemo(() => {
    return allMovements
      .filter((m) => m.type === "saida" && m.status === "confirmado")
      .reduce((acc, curr) => acc + curr.amount_cents, 0);
  }, [allMovements]);

  const saldoLiquidoCents = totalEntradasCents - totalSaidasCents;

  // Quebra por Forma de Pagamento
  const paymentBreakdown = useMemo(() => {
    const counts: Record<string, number> = {
      credit: 0,
      debit: 0,
      cash: 0,
      pix: 0,
    };

    allMovements
      .filter((m) => m.type === "entrada" && m.status === "confirmado")
      .forEach((m) => {
        const key = m.payment_method in counts ? m.payment_method : "pix";
        counts[key] += m.amount_cents;
      });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    return [
      {
        key: "credit",
        label: "Cartão de crédito",
        amount_cents: counts.credit,
        color: "#8b5cf6",
        percent: total > 0 ? Math.round((counts.credit / total) * 100) : 0,
      },
      {
        key: "debit",
        label: "Cartão de débito",
        amount_cents: counts.debit,
        color: "#3b82f6",
        percent: total > 0 ? Math.round((counts.debit / total) * 100) : 0,
      },
      {
        key: "cash",
        label: "Dinheiro",
        amount_cents: counts.cash,
        color: "#10b981",
        percent: total > 0 ? Math.round((counts.cash / total) * 100) : 0,
      },
      {
        key: "pix",
        label: "Pix",
        amount_cents: counts.pix,
        color: "#06b6d4",
        percent: total > 0 ? Math.round((counts.pix / total) * 100) : 0,
      },
    ];
  }, [allMovements]);

  // Histórico de Fechamentos para a Sidebar/Cards
  const recentClosures = useMemo(() => {
    return closures.slice(0, 5);
  }, [closures]);

  // ==========================================================================
  // HANDLERS DE AÇÕES
  // ==========================================================================

  // 1. Exportação em CSV dos Dados Reais
  const handleExportCsv = () => {
    const lines: string[] = [];
    lines.push("RELATÓRIO FINANCEIRO E FLUXO DE CAIXA");
    lines.push(`Restaurante;${(r?.name || "").replace(/;/g, ",")}`);
    lines.push(`Período Inicial;${startDate}`);
    lines.push(`Período Final;${endDate}`);
    lines.push("");
    lines.push("INDICADORES GERAIS");
    lines.push("Indicador;Valor");
    lines.push(`Faturamento Bruto (R$);${((report?.gross_revenue_cents || 0) / 100).toFixed(2).replace(".", ",")}`);
    lines.push(`Descontos / Estornos (R$);${((report?.cancelled_amount_cents || 0) / 100).toFixed(2).replace(".", ",")}`);
    lines.push(`Taxa de Serviço 10% (R$);${((report?.estimated_service_fee_cents || 0) / 100).toFixed(2).replace(".", ",")}`);
    lines.push(`Total Entradas (R$);${(totalEntradasCents / 100).toFixed(2).replace(".", ",")}`);
    lines.push(`Total Saídas (R$);${(totalSaidasCents / 100).toFixed(2).replace(".", ",")}`);
    lines.push(`Saldo Líquido (R$);${(saldoLiquidoCents / 100).toFixed(2).replace(".", ",")}`);
    lines.push(`Comandas Finalizadas;${report?.closed_tabs_count || 0}`);
    lines.push("");
    lines.push("MOVIMENTAÇÕES FINANCEIRAS DETALHADAS");
    lines.push("Data e Hora;Tipo;Descrição;Forma de Pagamento;Valor (R$);Status");
    for (const m of filteredMovements) {
      const dt = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(m.created_at));
      const valStr = ((m.type === "saida" ? -m.amount_cents : m.amount_cents) / 100).toFixed(2).replace(".", ",");
      lines.push(`${dt};${m.type.toUpperCase()};${m.description.replace(/;/g, ",")};${getPaymentMethodLabel(m.payment_method)};${valStr};${m.status}`);
    }

    const csvContent = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `relatorio-financeiro-${r?.slug || "restaurante"}-${startDate}-a-${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setNotice("Relatório CSV exportado com sucesso!");
  };

  // 2. Exportação / Impressão em PDF
  const handleExportPdf = () => {
    window.print();
  };

  // 3. Impressão Térmica do Fechamento de Caixa
  const handlePrintThermalClose = () => {
    const nowStr = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());

    const gross = report?.gross_revenue_cents || 0;
    const fee = report?.estimated_service_fee_cents || 0;
    const total = gross + fee;

    const paymentsRows = paymentBreakdown
      .map(
        (p) => `
      <div class="row">
        <span>${p.label}:</span>
        <span class="bold">${formatCents(p.amount_cents)} (${p.percent}%)</span>
      </div>`
      )
      .join("");

    const html = `
      <div class="thermal-receipt">
        <div class="center">
          <div class="title">${(r?.name || "RESTAURANTE").toUpperCase()}</div>
          <div class="bold" style="margin-top: 2px;">FECHAMENTO DE CAIXA E TURNO</div>
          <div style="font-size: 11px; margin-top: 2px;">Data de Emissão: ${nowStr}</div>
        </div>
        <div class="dashed-line"></div>
        <div>
          <div class="row">
            <span>Período:</span>
            <span class="bold">${startDate} a ${endDate}</span>
          </div>
          <div class="row">
            <span>Comandas Finalizadas:</span>
            <span class="bold">${report?.closed_tabs_count || 0}</span>
          </div>
          <div class="row">
            <span>Ticket Médio:</span>
            <span class="bold">${formatCents(report?.average_ticket_cents || 0)}</span>
          </div>
        </div>
        <div class="dashed-line"></div>
        <div class="bold" style="margin-bottom: 2px;">VALORES APURADOS</div>
        <div class="row">
          <span>Subtotal Vendas:</span>
          <span>${formatCents(gross)}</span>
        </div>
        <div class="row">
          <span>Taxa de Serviço (10%):</span>
          <span>${formatCents(fee)}</span>
        </div>
        <div class="row">
          <span>Descontos / Estornos:</span>
          <span>${formatCents(report?.cancelled_amount_cents || 0)}</span>
        </div>
        <div class="double-line"></div>
        <div class="row large-title">
          <span>TOTAL GERAL:</span>
          <span>${formatCents(total)}</span>
        </div>
        <div class="dashed-line"></div>
        <div class="bold" style="margin-bottom: 2px;">CONFERÊNCIA POR MEIO DE PAGAMENTO</div>
        ${paymentsRows}
        <div class="dashed-line"></div>
        <div class="row">
          <span>Total Entradas:</span>
          <span class="bold">${formatCents(totalEntradasCents)}</span>
        </div>
        <div class="row">
          <span>Total Saídas:</span>
          <span class="bold">${formatCents(totalSaidasCents)}</span>
        </div>
        <div class="row">
          <span>Saldo do Caixa:</span>
          <span class="bold">${formatCents(saldoLiquidoCents)}</span>
        </div>
        <div class="dashed-line"></div>
        <div class="center bold" style="font-size: 10px; margin-top: 4px;">
          DOCUMENTO GERENCIAL INTERNO — SEM VALOR FISCAL
        </div>
      </div>
    `;

    printThermalReceipt(html, "80mm");
  };

  // 4. Salvar Fechamento de Caixa
  const handleConfirmClosure = (e: FormEvent) => {
    e.preventDefault();
    setClosureBusy(true);

    const gross = report?.gross_revenue_cents || 0;
    const fee = report?.estimated_service_fee_cents || 0;
    const disc = report?.cancelled_amount_cents || 0;
    const total = gross + fee;

    const newClosure: CashRegisterClosure = {
      id: crypto.randomUUID(),
      restaurant_id: r?.id || "",
      closed_at: new Date().toISOString(),
      shift: selectedShift,
      operator_name: closureOperator.trim() || "Operador de Caixa",
      total_sales_cents: gross,
      total_service_fee_cents: fee,
      total_discounts_cents: disc,
      total_received_cents: total,
      cash_cents: paymentBreakdown.find((p) => p.key === "cash")?.amount_cents || 0,
      cards_cents:
        (paymentBreakdown.find((p) => p.key === "credit")?.amount_cents || 0) +
        (paymentBreakdown.find((p) => p.key === "debit")?.amount_cents || 0),
      pix_cents: paymentBreakdown.find((p) => p.key === "pix")?.amount_cents || 0,
      tabs_count: report?.closed_tabs_count || 0,
      notes: closureNotes.trim() || undefined,
    };

    setClosures((prev) => [newClosure, ...prev]);
    setNotice("Fechamento de caixa concluído e registrado com sucesso!");
    setIsClosureModalOpen(false);
    setClosureNotes("");
    setClosureBusy(false);
  };

  // 5. Salvar Nova Movimentação Manual (Sangria / Suprimento / Despesa)
  const handleSaveMovement = (e: FormEvent) => {
    e.preventDefault();
    const valNum = parseFloat(movAmount.replace(/\./g, "").replace(",", "."));
    if (isNaN(valNum) || valNum <= 0) {
      setError("Informe um valor válido maior que zero.");
      return;
    }

    const cents = Math.round(valNum * 100);
    const newMov: CashMovementItem = {
      id: crypto.randomUUID(),
      restaurant_id: r?.id || "",
      type: movType,
      category: movCategory,
      description: movDescription.trim() || (movType === "saida" ? "Sangria de caixa" : "Suprimento de caixa"),
      amount_cents: cents,
      payment_method: movPaymentMethod,
      created_at: new Date().toISOString(),
      user_name: "Operador de Caixa",
      status: "confirmado",
    };

    setManualMovements((prev) => [newMov, ...prev]);
    setNotice(`Movimentação de ${movType === "entrada" ? "Entrada" : "Saída"} registrada com sucesso!`);
    setIsNewMovementModalOpen(false);
    setMovDescription("");
    setMovAmount("");
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 text-zinc-900 dark:text-zinc-100 antialiased pb-12 pt-0">
      {/* =========================================================================
          ALERTA DE FEEDBACK
          ========================================================================= */}
      {notice && (
        <div
          role="status"
          className="flex items-center justify-between p-3.5 rounded-xl border bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-900 text-sm font-semibold"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            className="text-emerald-600 dark:text-emerald-300 hover:text-emerald-900 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between p-3.5 rounded-xl border bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-900 text-sm font-semibold"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-600 dark:text-rose-300 hover:text-rose-900 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* =========================================================================
          CABEÇALHO PADRÃO DO ADMIN
          ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            {activeView === "fechamento" ? "Fechamento de Caixa" : "Relatório Financeiro"}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {activeView === "fechamento"
              ? "Finalize o período, confira os valores e gere o relatório de fechamento."
              : "Acompanhe o desempenho financeiro do seu restaurante em tempo real."}
          </p>
        </div>

        {/* Botões de Ação do Topo */}
        <div className="flex flex-wrap items-center gap-2.5">
          {activeView === "fechamento" ? (
            <>
              <button
                type="button"
                onClick={() => switchView("relatorio")}
                className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-semibold shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>← Voltar ao Relatório</span>
              </button>

              <button
                type="button"
                onClick={handlePrintThermalClose}
                className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-semibold shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ThermalPrinterIcon className="w-3.5 h-3.5 text-zinc-500" />
                <span>Imprimir Fechamento</span>
              </button>

              <button
                type="button"
                onClick={() => setIsClosureModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-[#610000] hover:bg-[#7a0000] text-white text-xs font-bold shadow-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>🔒 Fechar caixa</span>
              </button>
            </>
          ) : (
            <>
              {/* Presets Rápidos de Data */}
              <div className="inline-flex rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] p-1 shadow-2xs">
                {(
                  [
                    ["today", "Hoje"],
                    ["7d", "7 dias"],
                    ["month", "Mês"],
                  ] as const
                ).map(([key, label]) => {
                  const active = preset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyPreset(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        active
                          ? "bg-[#610000] text-white shadow-2xs"
                          : "text-zinc-600 dark:text-zinc-300 hover:text-zinc-900"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleExportPdf}
                className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-semibold shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9V2h12v7" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                <span>Exportar PDF</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-semibold shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Exportar CSV</span>
              </button>

              <button
                type="button"
                onClick={() => switchView("fechamento")}
                className="px-4 py-2 rounded-xl bg-[#610000] hover:bg-[#7a0000] text-white text-xs font-bold shadow-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>🔒 Ver fechamento</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* =========================================================================
          SELETORES DE DATA E TURNO (INTEGRADOS)
          ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            <span className="text-zinc-400">📅 Intervalo:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setPreset("custom");
                setStartDate(e.target.value);
              }}
              className="px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-hidden"
            />
            <span className="text-zinc-400">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setPreset("custom");
                setEndDate(e.target.value);
              }}
              className="px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-hidden"
            />
          </div>

          {activeView === "fechamento" && (
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 border-l border-zinc-200 dark:border-zinc-700 pl-3">
              <span className="text-zinc-400">Turno:</span>
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer"
              >
                <option value="all">Dia todo (Completo)</option>
                <option value="morning">Manhã / Almoço</option>
                <option value="night">Noite / Jantar</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchReport()}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>{loading ? "Atualizando..." : "Atualizar dados"}</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          VISÃO 1: TELA PRINCIPAL (RELATÓRIO FINANCEIRO / PAINEL FINANCEIRO)
          ========================================================================= */}
      {activeView === "relatorio" && (
        <div className="space-y-6">
          {/* B. LINHA DE 5 CARDS DE KPIS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Card 1: Faturamento Bruto */}
            <div className="bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Faturamento Bruto
              </span>
              <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white mt-1">
                {loading ? "..." : formatCents(report?.gross_revenue_cents ?? 0)}
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                Soma de todos os pedidos
              </p>
            </div>

            {/* Card 2: Descontos */}
            <div className="bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Descontos / Estornos
              </span>
              <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white mt-1">
                {loading ? "..." : formatCents(report?.cancelled_amount_cents ?? 0)}
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                {report?.cancelled_items_count ?? 0} item(ns) cancelado(s)
              </p>
            </div>

            {/* Card 3: Taxa de Serviço (10%) */}
            <div className="bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Taxa de Serviço (10%)
              </span>
              <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white mt-1">
                {loading ? "..." : formatCents(report?.estimated_service_fee_cents ?? 0)}
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                Gorjetas e taxa de serviço
              </p>
            </div>

            {/* Card 4: Total de Vendas (Líquido) */}
            <div className="bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Total de Vendas (Líquido)
              </span>
              <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {loading
                  ? "..."
                  : formatCents((report?.gross_revenue_cents ?? 0) + (report?.estimated_service_fee_cents ?? 0))}
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                Valor líquido apurado
              </p>
            </div>

            {/* Card 5: Comandas Finalizadas */}
            <div className="bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Comandas Finalizadas
              </span>
              <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white mt-1">
                {loading ? "..." : report?.closed_tabs_count ?? 0}
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                Ticket médio: {formatCents(report?.average_ticket_cents ?? 0)}
              </p>
            </div>
          </div>

          {/* C. LINHA INTERMEDIÁRIA (3 COLUNAS) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* 1. Resumo por Forma de Pagamento (4 colunas) */}
            <div className="lg:col-span-4 bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Resumo por Forma de Pagamento
                  </h2>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    Distribuição da receita no período
                  </p>
                </div>
              </div>

              {/* Donut Chart em SVG */}
              <div className="flex items-center justify-center py-2">
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke="#f4f4f5"
                      strokeWidth="12"
                      className="dark:stroke-zinc-800"
                    />
                    {totalEntradasCents > 0 ? (
                      paymentBreakdown.reduce(
                        (acc, item) => {
                          const strokeDasharray = `${(item.percent * 251.2) / 100} 251.2`;
                          const strokeDashoffset = -acc.offset;
                          acc.elements.push(
                            <circle
                              key={item.key}
                              cx="50"
                              cy="50"
                              r="40"
                              fill="transparent"
                              stroke={item.color}
                              strokeWidth="12"
                              strokeDasharray={strokeDasharray}
                              strokeDashoffset={strokeDashoffset}
                              strokeLinecap="round"
                            />
                          );
                          acc.offset += (item.percent * 251.2) / 100;
                          return acc;
                        },
                        { elements: [] as any[], offset: 0 }
                      ).elements
                    ) : (
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="transparent"
                        stroke="#e4e4e7"
                        strokeWidth="12"
                        className="dark:stroke-zinc-800"
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Total</span>
                    <span className="text-xs sm:text-sm font-black text-zinc-900 dark:text-white truncate max-w-[100px]">
                      {formatCents(totalEntradasCents)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Lista dos Métodos com Valores e Percentuais */}
              <div className="space-y-2 border-t border-zinc-100 dark:border-zinc-800/80 pt-3 text-xs">
                {paymentBreakdown.map((item) => (
                  <div key={item.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-bold text-zinc-900 dark:text-white">{formatCents(item.amount_cents)}</span>
                      <span className="text-zinc-400 text-[11px] w-8 text-right font-sans">{item.percent}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Evolução do Faturamento (5 colunas) */}
            <div className="lg:col-span-5 bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Evolução do Faturamento
                  </h2>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    Histórico diário com base nas vendas
                  </p>
                </div>

                <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 p-0.5 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setChartRange("7d")}
                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                      chartRange === "7d" ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-2xs" : "text-zinc-500"
                    }`}
                  >
                    7 dias
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartRange("30d")}
                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                      chartRange === "30d" ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-2xs" : "text-zinc-500"
                    }`}
                  >
                    30 dias
                  </button>
                </div>
              </div>

              {/* Gráfico SVG de Linha/Área Suave */}
              <div className="h-44 w-full flex flex-col justify-end">
                {report && report.daily_breakdown.length > 0 ? (
                  <div className="h-full w-full relative">
                    <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 300 100">
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#610000" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#610000" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      {(() => {
                        const days = report.daily_breakdown.slice(-7);
                        const maxVal = Math.max(...days.map((d) => Number(d.revenue_cents || 0)), 100);
                        const points = days.map((d, i) => {
                          const x = (i / Math.max(days.length - 1, 1)) * 300;
                          const y = 90 - (Number(d.revenue_cents || 0) / maxVal) * 80;
                          return `${x},${y}`;
                        });
                        const areaPath = `M 0,100 L ${points.join(" L ")} L 300,100 Z`;
                        const linePath = `M ${points.join(" L ")}`;

                        return (
                          <>
                            <path d={areaPath} fill="url(#revenueGrad)" />
                            <path d={linePath} fill="none" stroke="#610000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            {days.map((d, i) => {
                              const x = (i / Math.max(days.length - 1, 1)) * 300;
                              const y = 90 - (Number(d.revenue_cents || 0) / maxVal) * 80;
                              return (
                                <circle
                                  key={i}
                                  cx={x}
                                  cy={y}
                                  r="3.5"
                                  className="fill-white stroke-[#610000] stroke-2 hover:r-5 transition-all cursor-pointer"
                                />
                              );
                            })}
                          </>
                        );
                      })()}
                    </svg>
                    <div className="flex justify-between items-center text-[10px] text-zinc-400 mt-2 font-mono">
                      {report.daily_breakdown.slice(-7).map((d, idx) => (
                        <span key={idx}>{(d.date ?? d.day ?? "").slice(5)}</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                    Sem histórico de vendas para o intervalo selecionado.
                  </div>
                )}
              </div>
            </div>

            {/* 3. Fechamentos de Caixa (3 colunas) */}
            <div className="lg:col-span-3 bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Fechamentos de Caixa
                  </h2>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    Últimos turnos finalizados
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => switchView("fechamento")}
                  className="text-xs font-bold text-[#610000] dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Ver todos →
                </button>
              </div>

              {recentClosures.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                  Nenhum fechamento registrado ainda.
                </div>
              ) : (
                <div className="space-y-2">
                  {recentClosures.map((cl) => {
                    const dtStr = new Intl.DateTimeFormat("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(cl.closed_at));

                    return (
                      <div
                        key={cl.id}
                        className="p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-zinc-800 dark:text-zinc-200">{dtStr}</div>
                          <div className="text-[11px] text-zinc-400">{cl.operator_name}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold font-mono text-zinc-900 dark:text-white">
                            {formatCents(cl.total_received_cents)}
                          </div>
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Finalizado
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* D. LINHA INFERIOR (TABELA DE MOVIMENTAÇÕES + BARRA LATERAL DIREITA) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* 1. Tabela "Movimentações financeiras" (9 colunas) */}
            <div className="lg:col-span-9 bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-2xs overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">
                    Movimentações financeiras
                  </h2>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    Extrato de entradas e saídas do período selecionado
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={movTypeFilter}
                    onChange={(e) => {
                      setMovTypeFilter(e.target.value as any);
                      setMovCurrentPage(1);
                    }}
                    className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer shadow-2xs"
                  >
                    <option value="all">Todos os tipos</option>
                    <option value="entrada">Apenas Entradas</option>
                    <option value="saida">Apenas Saídas</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setIsNewMovementModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-[#610000] hover:bg-[#7a0000] text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                  >
                    + Nova movimentação
                  </button>
                </div>
              </div>

              {/* Tabela de Movimentações */}
              {loading ? (
                <div className="py-16 text-center text-zinc-400 text-sm">Carregando movimentações do banco...</div>
              ) : filteredMovements.length === 0 ? (
                <div className="py-16 text-center text-zinc-400">
                  <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    Nenhuma movimentação registrada neste período
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">
                    Os recebimentos de comandas e lançamentos aparecerão aqui automaticamente.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="border-b border-zinc-200/70 dark:border-zinc-800 text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50/50 dark:bg-zinc-900/50">
                        <th className="py-3 px-4">DATA / HORA</th>
                        <th className="py-3 px-4">DESCRIÇÃO</th>
                        <th className="py-3 px-4">FORMA DE PAGAMENTO</th>
                        <th className="py-3 px-4">TIPO</th>
                        <th className="py-3 px-4">VALOR</th>
                        <th className="py-3 px-4">STATUS</th>
                        <th className="py-3 px-4 text-right">AÇÕES</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70 text-xs">
                      {paginatedMovements.map((m) => {
                        const dtStr = new Intl.DateTimeFormat("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(m.created_at));

                        return (
                          <tr key={m.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-medium text-zinc-600 dark:text-zinc-400">
                              {dtStr}
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-zinc-800 dark:text-zinc-200">
                              {m.description}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center gap-1.5 font-medium text-zinc-600 dark:text-zinc-300">
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: getPaymentMethodColor(m.payment_method) }}
                                />
                                {getPaymentMethodLabel(m.payment_method)}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              {m.type === "entrada" ? (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800">
                                  Entrada
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800">
                                  Saída
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold">
                              <span className={m.type === "entrada" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                                {m.type === "saida" ? "- " : "+ "}
                                {formatCents(m.amount_cents)}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                Confirmado
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                                title="Mais detalhes"
                              >
                                ⋮
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Paginação */}
              <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
                <span>
                  Mostrando {filteredMovements.length > 0 ? (movCurrentPage - 1) * movPageSize + 1 : 0} a{" "}
                  {Math.min(movCurrentPage * movPageSize, filteredMovements.length)} de {filteredMovements.length} movimentações
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={movCurrentPage <= 1}
                    onClick={() => setMovCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-40 cursor-pointer"
                  >
                    Anterior
                  </button>
                  <span className="px-2 font-bold text-zinc-700 dark:text-zinc-300">
                    {movCurrentPage} / {totalMovPages}
                  </span>
                  <button
                    type="button"
                    disabled={movCurrentPage >= totalMovPages}
                    onClick={() => setMovCurrentPage((p) => Math.min(totalMovPages, p + 1))}
                    className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-40 cursor-pointer"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Barra Lateral Direita (3 colunas) */}
            <div className="lg:col-span-3 space-y-4">
              {/* Card "Relatórios rápidos" */}
              <div className="bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Relatórios rápidos
                </h3>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setQuickReportModal("vendas")}
                    className="w-full p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-bold text-zinc-900 dark:text-white">1. Vendas por período</p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Confira o desempenho detalhado de vendas</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQuickReportModal("ticket")}
                    className="w-full p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-bold text-zinc-900 dark:text-white">2. Ticket médio</p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Análise do valor médio por pedido</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQuickReportModal("produtos")}
                    className="w-full p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-bold text-zinc-900 dark:text-white">3. Produtos mais vendidos</p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Veja os itens com mais saída</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQuickReportModal("comissao")}
                    className="w-full p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-bold text-zinc-900 dark:text-white">4. Comissão de garçons</p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Relatório de comissões e repasses (10%)</p>
                  </button>
                </div>
              </div>

              {/* Card Dica */}
              <div className="bg-[#fbf7f2] dark:bg-amber-950/20 border border-[#f0e6dc] dark:border-amber-900/40 rounded-2xl p-4 shadow-2xs flex items-start gap-3">
                <div className="p-2 rounded-xl bg-[#610000] text-white shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Dica de Gestão</h4>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">
                    Efetue o fechamento de caixa ao final de cada turno para manter o fluxo de caixa conciliado e evitar divergências de sangrias e cartões.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VISÃO 2: GUIA "FECHAMENTO DE CAIXA" (E MOVIMENTAÇÕES DETALHADAS)
          ========================================================================= */}
      {activeView === "fechamento" && (
        <div className="space-y-6">
          {/* A. BLOCO SUPERIOR — FECHAMENTO DE CAIXA */}
          <div className="bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-5">
            {/* 4 Cards de KPIs do Turno/Período */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-700/60">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total de vendas</span>
                <div className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
                  {formatCents(report?.gross_revenue_cents ?? 0)}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5 font-medium">{report?.closed_tabs_count ?? 0} comandas fechadas</p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-700/60">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Descontos / Estornos</span>
                <div className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
                  {formatCents(report?.cancelled_amount_cents ?? 0)}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5 font-medium">
                  {report?.gross_revenue_cents && report.gross_revenue_cents > 0
                    ? `${Math.round(((report.cancelled_amount_cents || 0) / report.gross_revenue_cents) * 100)}% do total`
                    : "0% do total"}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-700/60">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Taxa de serviço</span>
                <div className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
                  {formatCents(report?.estimated_service_fee_cents ?? 0)}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5 font-medium">10% de serviço sugerido</p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/50">
                <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Total no período</span>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatCents((report?.gross_revenue_cents ?? 0) + (report?.estimated_service_fee_cents ?? 0))}
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5 font-medium">Valor líquido consolidado</p>
              </div>
            </div>

            {/* Grid de Conferência em 4 Colunas */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              {/* Coluna 1: Resumo por forma de pagamento */}
              <div className="p-4 rounded-xl border border-zinc-200/70 dark:border-zinc-700/60 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  Resumo por forma de pagamento
                </h3>
                <div className="space-y-2.5">
                  {paymentBreakdown.map((p) => (
                    <div key={p.key} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">{p.label}</span>
                        <span className="font-bold font-mono text-zinc-900 dark:text-white">
                          {formatCents(p.amount_cents)} ({p.percent}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${p.percent}%`, backgroundColor: p.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coluna 2: Movimentações do dia */}
              <div className="p-4 rounded-xl border border-zinc-200/70 dark:border-zinc-700/60 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  Movimentações do dia
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/40">
                    <span className="text-zinc-600 dark:text-zinc-400">Vendas (+)</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +{formatCents(report?.gross_revenue_cents ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/40">
                    <span className="text-zinc-600 dark:text-zinc-400">Descontos (-)</span>
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                      -{formatCents(report?.cancelled_amount_cents ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/40">
                    <span className="text-zinc-600 dark:text-zinc-400">Taxa de serviço (+)</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +{formatCents(report?.estimated_service_fee_cents ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/40">
                    <span className="text-zinc-600 dark:text-zinc-400">Saídas / Sangrias (-)</span>
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                      -{formatCents(totalSaidasCents)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Coluna 3: Resumo do caixa */}
              <div className="p-4 rounded-xl border border-zinc-200/70 dark:border-zinc-700/60 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  Resumo do caixa
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Dinheiro no caixa:</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-white">
                      {formatCents(paymentBreakdown.find((p) => p.key === "cash")?.amount_cents ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Cartões (Déb./Créd.):</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-white">
                      {formatCents(
                        (paymentBreakdown.find((p) => p.key === "credit")?.amount_cents ?? 0) +
                          (paymentBreakdown.find((p) => p.key === "debit")?.amount_cents ?? 0)
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Pix recebidos:</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-white">
                      {formatCents(paymentBreakdown.find((p) => p.key === "pix")?.amount_cents ?? 0)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center font-bold">
                    <span className="text-emerald-700 dark:text-emerald-400">✓ Total conferido:</span>
                    <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                      {formatCents(totalEntradasCents)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Coluna 4: Últimos fechamentos */}
              <div className="p-4 rounded-xl border border-zinc-200/70 dark:border-zinc-700/60 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  Últimos fechamentos
                </h3>
                {closures.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-4 text-center">Nenhum fechamento registrado.</p>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {closures.slice(0, 4).map((c) => (
                      <div key={c.id} className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 text-xs flex justify-between items-center">
                        <div>
                          <div className="font-bold text-zinc-800 dark:text-zinc-200">
                            {new Date(c.closed_at).toLocaleDateString("pt-BR")}
                          </div>
                          <div className="text-[10px] text-zinc-400">{c.operator_name}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-zinc-900 dark:text-white">
                            {formatCents(c.total_received_cents)}
                          </div>
                          <span className="text-[10px] font-bold text-emerald-600">Finalizado</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* B. BLOCO INFERIOR — MOVIMENTAÇÕES (FLUXO DE CAIXA DETALHADO) */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Movimentações</h2>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Acompanhe todas as movimentações financeiras do seu restaurante, com filtros e resumo em tempo real.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={movTypeFilter}
                  onChange={(e) => {
                    setMovTypeFilter(e.target.value as any);
                    setMovCurrentPage(1);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 shadow-2xs"
                >
                  <option value="all">Todos os tipos</option>
                  <option value="entrada">Entradas</option>
                  <option value="saida">Saídas</option>
                </select>

                <select
                  value={movPaymentFilter}
                  onChange={(e) => {
                    setMovPaymentFilter(e.target.value);
                    setMovCurrentPage(1);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 shadow-2xs"
                >
                  <option value="all">Todos os meios</option>
                  <option value="pix">Pix</option>
                  <option value="credit">Cartão de Crédito</option>
                  <option value="debit">Cartão de Débito</option>
                  <option value="cash">Dinheiro</option>
                </select>

                <button
                  type="button"
                  onClick={() => setIsNewMovementModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-[#610000] hover:bg-[#7a0000] text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                >
                  + Nova movimentação
                </button>

                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 shadow-2xs cursor-pointer"
                >
                  Exportar PDF
                </button>
              </div>
            </div>

            {/* 4 Cards de Fluxo de Caixa */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
                <span className="text-xs font-medium text-zinc-500">Total de entradas</span>
                <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatCents(totalEntradasCents)}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
                <span className="text-xs font-medium text-zinc-500">Total de saídas</span>
                <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                  {formatCents(totalSaidasCents)}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
                <span className="text-xs font-medium text-zinc-500">Saldo do período</span>
                <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white mt-1">
                  {formatCents(saldoLiquidoCents)}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
                <span className="text-xs font-medium text-zinc-500">Total de transações</span>
                <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white mt-1">
                  {filteredMovements.length}
                </div>
              </div>
            </div>

            {/* Layout em 2 Colunas (9 colunas + 3 colunas) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Esquerda: 9 Colunas */}
              <div className="lg:col-span-9 bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-2xs overflow-hidden space-y-3 p-4">
                {/* Abas Pill + Busca */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMovTypeFilter("all")}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        movTypeFilter === "all" ? "bg-[#610000] text-white shadow-2xs" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                      }`}
                    >
                      Todas ({allMovements.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovTypeFilter("entrada")}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        movTypeFilter === "entrada" ? "bg-[#610000] text-white shadow-2xs" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                      }`}
                    >
                      Entradas
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovTypeFilter("saida")}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        movTypeFilter === "saida" ? "bg-[#610000] text-white shadow-2xs" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                      }`}
                    >
                      Saídas
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Buscar por descrição, valor, meio..."
                      value={movSearch}
                      onChange={(e) => {
                        setMovSearch(e.target.value);
                        setMovCurrentPage(1);
                      }}
                      className="w-full sm:w-64 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs bg-zinc-50 dark:bg-zinc-800/60"
                    />
                  </div>
                </div>

                {/* Tabela de Movimentações */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="border-b border-zinc-200/70 dark:border-zinc-800 text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider bg-zinc-50/50 dark:bg-zinc-900/50">
                        <th className="py-3 px-3">DATA / HORA</th>
                        <th className="py-3 px-3">TIPO</th>
                        <th className="py-3 px-3">DESCRIÇÃO</th>
                        <th className="py-3 px-3">FORMA DE PAGAMENTO</th>
                        <th className="py-3 px-3">VALOR</th>
                        <th className="py-3 px-3">USUÁRIO</th>
                        <th className="py-3 px-3">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70 text-xs">
                      {paginatedMovements.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-zinc-400">
                            Nenhuma movimentação encontrada com os filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        paginatedMovements.map((m) => (
                          <tr key={m.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                            <td className="py-3 px-3 font-mono text-zinc-600 dark:text-zinc-400">
                              {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  m.type === "entrada"
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                                }`}
                              >
                                {m.type.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-semibold text-zinc-800 dark:text-zinc-200">
                              {m.description}
                            </td>
                            <td className="py-3 px-3">{getPaymentMethodLabel(m.payment_method)}</td>
                            <td className="py-3 px-3 font-mono font-bold">
                              <span className={m.type === "entrada" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                                {m.type === "saida" ? "- " : "+ "}
                                {formatCents(m.amount_cents)}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-zinc-500">{m.user_name}</td>
                            <td className="py-3 px-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                                Confirmado
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Paginação */}
                <div className="flex items-center justify-between text-xs text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <span>
                    Página {movCurrentPage} de {totalMovPages}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={movCurrentPage <= 1}
                      onClick={() => setMovCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      disabled={movCurrentPage >= totalMovPages}
                      onClick={() => setMovCurrentPage((p) => Math.min(totalMovPages, p + 1))}
                      className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-40"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              </div>

              {/* Direita: 3 Colunas */}
              <div className="lg:col-span-3 space-y-4">
                {/* Donut Resumo por Forma de Pagamento */}
                <div className="bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Resumo por forma de pagamento
                  </h3>
                  <div className="space-y-2 text-xs">
                    {paymentBreakdown.map((p) => (
                      <div key={p.key} className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">{p.label}</span>
                        </div>
                        <span className="font-mono font-bold">{p.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card Últimas Movimentações */}
                <div className="bg-white dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Últimas movimentações
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-xs">
                    {allMovements.slice(0, 5).map((m) => (
                      <div
                        key={m.id}
                        className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex items-center justify-between"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-zinc-800 dark:text-zinc-200 truncate">{m.description}</p>
                          <p className="text-[10px] text-zinc-400">
                            {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} • {getPaymentMethodLabel(m.payment_method)}
                          </p>
                        </div>
                        <span
                          className={`font-mono font-bold shrink-0 ${
                            m.type === "entrada" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {m.type === "saida" ? "-" : "+"}
                          {formatCents(m.amount_cents)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: FECHAR CAIXA
          ========================================================================= */}
      {isClosureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">Fechamento de Caixa</h3>
                <p className="text-xs text-zinc-400">Confira os valores e confirme o encerramento do turno</p>
              </div>
              <button
                type="button"
                onClick={() => setIsClosureModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmClosure} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Período:</span>
                  <span className="font-bold">{startDate} a {endDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Turno:</span>
                  <span className="font-bold">{selectedShift === "all" ? "Dia todo" : selectedShift === "morning" ? "Manhã" : "Noite"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Comandas finalizadas:</span>
                  <span className="font-bold font-mono">{report?.closed_tabs_count || 0}</span>
                </div>
                <div className="flex justify-between text-sm font-black pt-2 border-t border-zinc-200 dark:border-zinc-700">
                  <span>Total apurado:</span>
                  <span className="text-emerald-600 font-mono">
                    {formatCents((report?.gross_revenue_cents || 0) + (report?.estimated_service_fee_cents || 0))}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Responsável pelo Fechamento:
                </label>
                <input
                  type="text"
                  required
                  value={closureOperator}
                  onChange={(e) => setClosureOperator(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Observações de Caixa (Opcional):
                </label>
                <textarea
                  rows={3}
                  value={closureNotes}
                  onChange={(e) => setClosureNotes(e.target.value)}
                  placeholder="Ex: Sangria efetuada para depósito bancário, sem divergências no dinheiro..."
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsClosureModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={closureBusy}
                  className="px-4 py-2 rounded-xl bg-[#610000] hover:bg-[#7a0000] text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  {closureBusy ? "Registrando..." : "Confirmar Fechamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: NOVA MOVIMENTAÇÃO (SANGRIA / SUPRIMENTO)
          ========================================================================= */}
      {isNewMovementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">Nova Movimentação de Caixa</h3>
                <p className="text-xs text-zinc-400">Lance uma sangria, suprimento ou despesa avulsa</p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewMovementModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMovement} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMovType("saida");
                    setMovCategory("sangria");
                  }}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    movType === "saida"
                      ? "bg-rose-50 border-rose-300 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      : "border-zinc-200 dark:border-zinc-800 text-zinc-500"
                  }`}
                >
                  Saída (Sangria / Despesa)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMovType("entrada");
                    setMovCategory("suprimento");
                  }}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    movType === "entrada"
                      ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-zinc-200 dark:border-zinc-800 text-zinc-500"
                  }`}
                >
                  Entrada (Suprimento / Aporte)
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Descrição da Movimentação:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Sangria para cofre, Compra emergencial de gelo..."
                  value={movDescription}
                  onChange={(e) => setMovDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Valor (R$):
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0,00"
                    value={movAmount}
                    onChange={(e) => setMovAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Forma de Pagamento:
                  </label>
                  <select
                    value={movPaymentMethod}
                    onChange={(e) => setMovPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-semibold cursor-pointer"
                  >
                    <option value="cash">Dinheiro</option>
                    <option value="pix">Pix</option>
                    <option value="credit">Cartão de Crédito</option>
                    <option value="debit">Cartão de Débito</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsNewMovementModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#610000] hover:bg-[#7a0000] text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Salvar Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: RELATÓRIOS RÁPIDOS
          ========================================================================= */}
      {quickReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  {quickReportModal === "vendas" && "Relatório: Vendas por Período"}
                  {quickReportModal === "ticket" && "Relatório: Ticket Médio"}
                  {quickReportModal === "produtos" && "Relatório: Produtos Mais Vendidos"}
                  {quickReportModal === "comissao" && "Relatório: Comissão e Taxa de Serviço"}
                </h3>
                <p className="text-xs text-zinc-400">Detalhamento dos indicadores apurados no período</p>
              </div>
              <button
                type="button"
                onClick={() => setQuickReportModal(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-3 text-xs pr-1">
              {quickReportModal === "vendas" && (
                <div className="space-y-2">
                  {report?.daily_breakdown && report.daily_breakdown.length > 0 ? (
                    report.daily_breakdown.map((row) => (
                      <div key={row.date ?? row.day} className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 flex justify-between">
                        <div>
                          <p className="font-bold text-zinc-900 dark:text-white">{row.date ?? row.day}</p>
                          <p className="text-[11px] text-zinc-400">{row.tabs_count} comandas finalizadas</p>
                        </div>
                        <span className="font-mono font-bold text-zinc-900 dark:text-white">{formatCents(Number(row.revenue_cents || 0))}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-zinc-400 py-6">Sem vendas registradas no período selecionado.</p>
                  )}
                </div>
              )}

              {quickReportModal === "ticket" && (
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Ticket Médio por Comanda:</span>
                    <span className="font-bold font-mono text-zinc-900 dark:text-white">{formatCents(report?.average_ticket_cents || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Comandas Finalizadas:</span>
                    <span className="font-bold font-mono">{report?.closed_tabs_count || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Faturamento Bruto:</span>
                    <span className="font-bold font-mono">{formatCents(report?.gross_revenue_cents || 0)}</span>
                  </div>
                </div>
              )}

              {quickReportModal === "produtos" && (
                <div className="space-y-2">
                  {report?.top_products && report.top_products.length > 0 ? (
                    report.top_products.map((p, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-bold text-zinc-800 dark:text-zinc-200">{p.product_name}</p>
                            <p className="text-[11px] text-zinc-400">{p.quantity_sold ?? p.total_quantity ?? 0} unidades vendidas</p>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-zinc-900 dark:text-white">{formatCents(p.total_revenue_cents)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-zinc-400 py-6">Nenhum produto vendido no período.</p>
                  )}
                </div>
              )}

              {quickReportModal === "comissao" && (
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Taxa de Serviço Arrecadada (10%):</span>
                    <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">{formatCents(report?.estimated_service_fee_cents || 0)}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Valor total recolhido de serviço nas comandas fechadas para rateio entre garçons, copa e equipe de atendimento.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setQuickReportModal(null)}
                className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
