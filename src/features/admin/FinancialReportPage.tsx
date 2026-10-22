import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRestaurant } from '../restaurants/RestaurantProvider';
import { printThermalReceipt, ThermalPrinterIcon } from '../../components/ThermalReceiptPrint';

interface TopProductItem {
  product_name: string;
  quantity_sold?: number;
  total_quantity?: number;
  total_revenue_cents: number;
}

interface DailyBreakdownItem {
  date?: string;
  day?: string;
  tabs_count: number;
  revenue_cents: number;
}

interface FinancialReportData {
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

type PeriodPreset = 'today' | '7d' | 'month' | 'custom';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatCents(cents: number): string {
  return currencyFormatter.format((cents || 0) / 100);
}

function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function computePresetDates(preset: Exclude<PeriodPreset, 'custom'>): { start: string; end: string } {
  const now = new Date();
  const end = toLocalDateInputValue(now);

  if (preset === 'today') {
    return { start: end, end };
  }
  if (preset === '7d') {
    const startObj = new Date(now);
    startObj.setDate(now.getDate() - 6);
    return { start: toLocalDateInputValue(startObj), end };
  }
  // month
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toLocalDateInputValue(startMonth), end };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function FinancialReportPage() {
  const { restaurant: r } = useRestaurant();
  const [preset, setPreset] = useState<PeriodPreset>('today');
  const initialDates = useMemo(() => computePresetDates('today'), []);
  const [startDate, setStartDate] = useState<string>(initialDates.start);
  const [endDate, setEndDate] = useState<string>(initialDates.end);
  const [report, setReport] = useState<FinancialReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = (nextPreset: Exclude<PeriodPreset, 'custom'>) => {
    setPreset(nextPreset);
    const { start, end } = computePresetDates(nextPreset);
    setStartDate(start);
    setEndDate(end);
  };

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
        return;
      }

      const { data, error: rpcError } = await supabase.rpc('get_restaurant_financial_report', {
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar relatório financeiro.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [r?.id, startDate, endDate]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const handlePrintThermalShiftClose = () => {
    if (!report) return;
    const nowStr = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());

    const totalWithService = report.gross_revenue_cents + report.estimated_service_fee_cents;

    const topProductsHtml =
      report.top_products.length > 0
        ? report.top_products
            .map(
              (item, idx) => `
          <div style="margin: 3px 0;">
            <div class="bold">${idx + 1}. ${escapeHtml(item.product_name)}</div>
            <div class="row">
              <span>Qtd: ${item.quantity_sold ?? item.total_quantity ?? 0}x</span>
              <span class="bold">${formatCents(item.total_revenue_cents)}</span>
            </div>
          </div>`
            )
            .join('')
        : `<div class="center" style="margin: 4px 0;">Sem vendas registradas no período</div>`;

    const html = `
      <div class="thermal-receipt">
        <div class="center">
          <div class="title">${escapeHtml((r.name || 'Restaurante').toUpperCase())}</div>
          <div class="bold" style="margin-top: 2px;">FECHAMENTO DE TURNO / CAIXA</div>
          <div style="font-size: 11px; margin-top: 2px;">Emitido em: ${nowStr}</div>
        </div>
        <div class="dashed-line"></div>
        <div>
          <div class="row">
            <span>Período:</span>
            <span class="bold">${escapeHtml(startDate)} a ${escapeHtml(endDate)}</span>
          </div>
          <div class="row">
            <span>Comandas Fechadas:</span>
            <span class="bold">${report.closed_tabs_count}</span>
          </div>
          <div class="row">
            <span>Ticket Médio:</span>
            <span class="bold">${formatCents(report.average_ticket_cents)}</span>
          </div>
        </div>
        <div class="dashed-line"></div>
        <div class="row">
          <span>SUBTOTAL (VENDAS):</span>
          <span class="bold">${formatCents(report.gross_revenue_cents)}</span>
        </div>
        <div class="row">
          <span>SERVIÇO ESTIMADO (10%):</span>
          <span>${formatCents(report.estimated_service_fee_cents)}</span>
        </div>
        <div class="double-line"></div>
        <div class="row large-title">
          <span>TOTAL GERAL:</span>
          <span>${formatCents(totalWithService)}</span>
        </div>
        <div class="dashed-line"></div>
        <div class="bold" style="margin-bottom: 2px;">AUDITORIA DE CANCELAMENTOS</div>
        <div class="row">
          <span>Itens Cancelados:</span>
          <span class="bold">${report.cancelled_items_count}</span>
        </div>
        <div class="row">
          <span>Valor Estornado:</span>
          <span class="bold">${formatCents(report.cancelled_amount_cents)}</span>
        </div>
        <div class="dashed-line"></div>
        <div class="bold" style="margin-bottom: 2px;">TOP 5 PRODUTOS MAIS VENDIDOS</div>
        ${topProductsHtml}
        <div class="dashed-line"></div>
        <div class="center bold" style="font-size: 10px; margin-top: 4px;">
          RELATÓRIO GERENCIAL INTERNO — SEM VALOR FISCAL
        </div>
      </div>
    `;

    printThermalReceipt(html, '80mm');
  };

  const handleExportCsv = () => {
    if (!report) return;

    const lines: string[] = [];
    lines.push('RELATORIO FINANCEIRO DE FECHAMENTO DE TURNO');
    lines.push(`Restaurante;${(r.name || '').replace(/;/g, ',')}`);
    lines.push(`Periodo Inicial;${startDate}`);
    lines.push(`Periodo Final;${endDate}`);
    lines.push('');
    lines.push('INDICADORES GERAIS');
    lines.push('Indicador;Valor');
    lines.push(`Faturamento Bruto (R$);${(report.gross_revenue_cents / 100).toFixed(2).replace('.', ',')}`);
    lines.push(
      `Taxa de Servico Estimada 10% (R$);${(report.estimated_service_fee_cents / 100).toFixed(2).replace('.', ',')}`
    );
    lines.push(`Comandas Fechadas;${report.closed_tabs_count}`);
    lines.push(`Ticket Medio (R$);${(report.average_ticket_cents / 100).toFixed(2).replace('.', ',')}`);
    lines.push(`Itens Cancelados (Qtd);${report.cancelled_items_count}`);
    lines.push(`Valor Cancelado/Estornado (R$);${(report.cancelled_amount_cents / 100).toFixed(2).replace('.', ',')}`);
    lines.push('');
    lines.push('RESUMO DIARIO');
    lines.push('Data;Comandas Fechadas;Faturamento Bruto (R$)');
    for (const dayRow of report.daily_breakdown) {
      lines.push(
        `${dayRow.date ?? dayRow.day ?? ''};${dayRow.tabs_count};${(Number(dayRow.revenue_cents || 0) / 100).toFixed(2).replace('.', ',')}`
      );
    }
    lines.push('');
    lines.push('TOP 5 PRODUTOS MAIS VENDIDOS');
    lines.push('Posicao;Produto;Quantidade Vendida;Faturamento Gerado (R$)');
    report.top_products.forEach((prod, index) => {
      lines.push(
        `${index + 1};${(prod.product_name || '').replace(/;/g, ',')};${prod.quantity_sold ?? prod.total_quantity ?? 0};${(
          Number(prod.total_revenue_cents || 0) / 100
        )
          .toFixed(2)
          .replace('.', ',')}`
      );
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `fechamento-caixa-${r.slug}-${startDate}-a-${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const maxProductRevenue = useMemo(() => {
    if (!report || report.top_products.length === 0) return 1;
    return Math.max(...report.top_products.map((p) => Number(p.total_revenue_cents || 0)), 1);
  }, [report]);

  return (
    <div className="space-y-6">
      {/* Header & Action Buttons */}
      <div className="panel p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="eyebrow">Gestão de Caixa & Auditoria</p>
            <h1 className="text-2xl font-bold mt-1" style={{ color: 'var(--admin-text, #2B1D17)' }}>
              Relatório Financeiro & Fechamento de Turno
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--admin-muted, #57534e)' }}>
              Consolidação das comandas encerradas, ticket médio, ranking de produtos e auditoria de cancelamentos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePrintThermalShiftClose}
              disabled={loading || !report}
              className="button inline-flex items-center gap-2 disabled:opacity-50"
            >
              <ThermalPrinterIcon className="w-4 h-4" />
              <span>Imprimir Fechamento de Turno (80mm)</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading || !report}
              className="button secondary inline-flex items-center gap-2 disabled:opacity-50"
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Period Filters */}
        <div
          className="mt-6 pt-5 border-t flex flex-col md:flex-row md:items-end justify-between gap-4"
          style={{ borderColor: 'var(--admin-border, #e7e5e4)' }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['today', 'Hoje (Turno Atual)'],
                ['7d', 'Últimos 7 dias'],
                ['month', 'Este Mês'],
              ] as const
            ).map(([key, label]) => {
              const active = preset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className={active ? 'button text-xs py-2 px-3.5' : 'button secondary text-xs py-2 px-3.5'}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="fin-start-date"
                className="block text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: 'var(--admin-muted, #57534e)' }}
              >
                Data Inicial
              </label>
              <input
                id="fin-start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setPreset('custom');
                  setStartDate(e.target.value);
                }}
                className="input py-1.5 px-3 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="fin-end-date"
                className="block text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: 'var(--admin-muted, #57534e)' }}
              >
                Data Final
              </label>
              <input
                id="fin-end-date"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setPreset('custom');
                  setEndDate(e.target.value);
                }}
                className="input py-1.5 px-3 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => void fetchReport()}
              disabled={loading}
              className="button secondary py-2 px-3.5 text-xs inline-flex items-center gap-1.5"
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
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span>Atualizar</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="rounded-2xl p-4 border text-sm font-medium"
          style={{
            background: 'rgba(220, 38, 38, 0.08)',
            borderColor: 'rgba(220, 38, 38, 0.3)',
            color: '#b91c1c',
          }}
        >
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Faturamento Bruto */}
        <div className="stat-card flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--admin-muted, #57534e)' }}>
              Faturamento Bruto
            </span>
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(43, 29, 23, 0.08)', color: 'var(--admin-text, #2B1D17)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </span>
          </div>
          <div className="mt-3">
            <strong className="text-2xl font-extrabold block">
              {loading ? '...' : formatCents(report?.gross_revenue_cents ?? 0)}
            </strong>
            <span className="text-xs mt-1 block" style={{ color: 'var(--admin-muted, #57534e)' }}>
              Soma de itens ativos em comandas fechadas
            </span>
          </div>
        </div>

        {/* Card 2: Taxa de Serviço Estimada (10%) */}
        <div className="stat-card flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--admin-muted, #57534e)' }}>
              Taxa de Serviço Estimada (10%)
            </span>
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(43, 29, 23, 0.08)', color: 'var(--admin-text, #2B1D17)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="19" y1="5" x2="5" y2="19" />
                <circle cx="6.5" cy="6.5" r="2.5" />
                <circle cx="17.5" cy="17.5" r="2.5" />
              </svg>
            </span>
          </div>
          <div className="mt-3">
            <strong className="text-2xl font-extrabold block">
              {loading ? '...' : formatCents(report?.estimated_service_fee_cents ?? 0)}
            </strong>
            <span className="text-xs mt-1 block" style={{ color: 'var(--admin-muted, #57534e)' }}>
              Total c/ 10%:{' '}
              {loading
                ? '...'
                : formatCents((report?.gross_revenue_cents ?? 0) + (report?.estimated_service_fee_cents ?? 0))}
            </span>
          </div>
        </div>

        {/* Card 3: Comandas Fechadas & Ticket Médio */}
        <div className="stat-card flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--admin-muted, #57534e)' }}>
              Comandas Fechadas & Ticket Médio
            </span>
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(43, 29, 23, 0.08)', color: 'var(--admin-text, #2B1D17)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </span>
          </div>
          <div className="mt-3">
            <strong className="text-2xl font-extrabold block">
              {loading ? '...' : `${report?.closed_tabs_count ?? 0} comandas`}
            </strong>
            <span className="text-xs mt-1 block font-medium" style={{ color: 'var(--admin-muted, #57534e)' }}>
              Ticket Médio: {loading ? '...' : formatCents(report?.average_ticket_cents ?? 0)}
            </span>
          </div>
        </div>

        {/* Card 4: Itens Cancelados / Estornados */}
        <div
          className="stat-card flex flex-col justify-between"
          style={{
            borderColor: 'rgba(217, 119, 6, 0.35)',
            background: 'var(--admin-card-bg, #ffffff)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b45309' }}>
              Itens Cancelados / Estornados
            </span>
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(245, 158, 11, 0.14)', color: '#b45309' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
          </div>
          <div className="mt-3">
            <strong className="text-2xl font-extrabold block" style={{ color: '#b45309' }}>
              {loading ? '...' : formatCents(report?.cancelled_amount_cents ?? 0)}
            </strong>
            <span className="text-xs mt-1 block" style={{ color: 'var(--admin-muted, #57534e)' }}>
              {loading ? '...' : `${report?.cancelled_items_count ?? 0} itens cancelados no período`}
            </span>
          </div>
        </div>
      </div>

      {/* Top 5 Products & Daily Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top 5 Produtos Mais Vendidos */}
        <div className="panel p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--admin-text, #2B1D17)' }}>
                Top 5 Produtos Mais Vendidos
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--admin-muted, #57534e)' }}>
                Ranking por volume e participação na receita das comandas fechadas
              </p>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm" style={{ color: 'var(--admin-muted, #57534e)' }}>
              Calculando ranking de produtos...
            </div>
          ) : !report || report.top_products.length === 0 ? (
            <div
              className="py-10 text-center rounded-xl border border-dashed text-sm"
              style={{ borderColor: 'var(--admin-border, #e7e5e4)', color: 'var(--admin-muted, #57534e)' }}
            >
              Nenhuma comanda fechada com itens vendidos neste período.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    className="border-b text-xs uppercase tracking-wider"
                    style={{ borderColor: 'var(--admin-border, #e7e5e4)', color: 'var(--admin-muted, #57534e)' }}
                  >
                    <th className="py-3 pr-4 font-semibold">Produto</th>
                    <th className="py-3 px-4 font-semibold text-right">Qtd. Vendida</th>
                    <th className="py-3 px-4 font-semibold text-right">Faturamento Gerado</th>
                    <th className="py-3 pl-4 font-semibold w-44">Participação</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--admin-border, #e7e5e4)' }}>
                  {report.top_products.map((prod, idx) => {
                    const revenue = Number(prod.total_revenue_cents || 0);
                    const shareOfGross =
                      report.gross_revenue_cents > 0
                        ? Math.round((revenue / report.gross_revenue_cents) * 100)
                        : 0;
                    const barWidth = Math.max(Math.round((revenue / maxProductRevenue) * 100), 6);

                    return (
                      <tr key={`${prod.product_name}-${idx}`} className="text-sm">
                        <td className="py-3.5 pr-4 font-semibold" style={{ color: 'var(--admin-text, #2B1D17)' }}>
                          <span
                            className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold mr-2.5"
                            style={{
                              background: 'rgba(43, 29, 23, 0.1)',
                              color: 'var(--admin-text, #2B1D17)',
                            }}
                          >
                            {idx + 1}
                          </span>
                          {prod.product_name}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold" style={{ color: 'var(--admin-text, #2B1D17)' }}>
                          {prod.quantity_sold ?? prod.total_quantity ?? 0} un.
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold" style={{ color: 'var(--admin-text, #2B1D17)' }}>
                          {formatCents(revenue)}
                        </td>
                        <td className="py-3.5 pl-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="flex-1 h-2.5 rounded-full overflow-hidden"
                              style={{ background: 'rgba(120, 113, 108, 0.16)' }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${barWidth}%`,
                                  background: 'var(--admin-button-bg, #2B1D17)',
                                }}
                              />
                            </div>
                            <span
                              className="text-xs font-semibold w-10 text-right"
                              style={{ color: 'var(--admin-muted, #57534e)' }}
                            >
                              {shareOfGross}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Fechamento Diário (Daily Breakdown) */}
        <div className="panel p-6">
          <h2 className="text-lg font-bold" style={{ color: 'var(--admin-text, #2B1D17)' }}>
            Evolução Diária
          </h2>
          <p className="text-xs mt-0.5 mb-4" style={{ color: 'var(--admin-muted, #57534e)' }}>
            Resumo de caixa por dia de fechamento
          </p>

          {loading ? (
            <div className="py-10 text-center text-sm" style={{ color: 'var(--admin-muted, #57534e)' }}>
              Carregando histórico diário...
            </div>
          ) : !report || report.daily_breakdown.length === 0 ? (
            <div
              className="py-10 text-center rounded-xl border border-dashed text-sm"
              style={{ borderColor: 'var(--admin-border, #e7e5e4)', color: 'var(--admin-muted, #57534e)' }}
            >
              Sem movimentação diária no período selecionado.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {report.daily_breakdown.map((row) => (
                <div
                  key={row.date ?? row.day}
                  className="p-3 rounded-xl border flex items-center justify-between"
                  style={{
                    borderColor: 'var(--admin-border, #e7e5e4)',
                    background: 'var(--admin-surface, #fafaf9)',
                  }}
                >
                  <div>
                    <div className="text-sm font-bold" style={{ color: 'var(--admin-text, #2B1D17)' }}>
                      {row.date ?? row.day}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--admin-muted, #57534e)' }}>
                      {row.tabs_count} {row.tabs_count === 1 ? 'comanda fechada' : 'comandas fechadas'}
                    </div>
                  </div>
                  <div className="text-sm font-extrabold" style={{ color: 'var(--admin-text, #2B1D17)' }}>
                    {formatCents(Number(row.revenue_cents || 0))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
