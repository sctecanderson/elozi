import React, { useState } from 'react';

export interface ThermalBillItem {
  name: string;
  quantity: number;
  unitPriceInCents: number;
  totalInCents: number;
  notes?: string;
}

export interface ThermalBillData {
  restaurantName: string;
  tableNumber: number | string;
  tabLabel: string;
  timestamp?: Date | string;
  items: ThermalBillItem[];
  subtotalInCents: number;
  serviceFeePercent?: number;
  serviceFeeInCents?: number;
  totalInCents: number;
  splitCount?: number;
  splitValueInCents?: number;
  paperWidth?: '80mm' | '58mm';
}

export interface ThermalKitchenTicketData {
  tableName: string;
  stationName: string;
  productName: string;
  quantity: number;
  notes?: string;
  timestamp?: Date | string;
  orderId?: string;
  paperWidth?: '80mm' | '58mm';
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const timeOnlyFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function generateBillReceiptHtml(data: ThermalBillData): string {
  const dateStr = data.timestamp
    ? timeFormatter.format(new Date(data.timestamp))
    : timeFormatter.format(new Date());

  const itemsHtml = data.items
    .map(
      (item) => `
    <div style="margin-bottom: 4px;">
      <div class="row">
        <span class="bold" style="max-width: 72%; word-break: break-word;">${item.quantity}x ${item.name}</span>
        <span class="bold right">${currencyFormatter.format(item.totalInCents / 100)}</span>
      </div>
      ${
        item.quantity > 1
          ? `<div style="font-size: 10px;">(${currencyFormatter.format(item.unitPriceInCents / 100)} un)</div>`
          : ''
      }
      ${
        item.notes
          ? `<div class="obs-box">OBS: ${item.notes}</div>`
          : ''
      }
    </div>
  `,
    )
    .join('');

  const splitHtml =
    data.splitCount && data.splitCount > 1 && data.splitValueInCents
      ? `
    <div class="dashed-line"></div>
    <div class="center bold" style="margin: 4px 0 2px 0;">DIVISAO DA CONTA</div>
    <div class="row bold" style="font-size: 13px;">
      <span>Valor por pessoa (${data.splitCount}x):</span>
      <span>${currencyFormatter.format(data.splitValueInCents / 100)}</span>
    </div>
  `
      : '';

  return `
    <div class="center bold title" style="text-transform: uppercase;">${data.restaurantName}</div>
    <div class="center bold" style="font-size: 11px; margin-top: 2px;">EXTRATO DE CONFERENCIA DE CONTA</div>
    <div class="center" style="font-size: 10px; margin-bottom: 4px;">*** NAO E DOCUMENTO FISCAL ***</div>
    <div class="dashed-line"></div>
    <div class="row">
      <span class="bold">MESA ${String(data.tableNumber).padStart(2, '0')}</span>
      <span>${dateStr}</span>
    </div>
    <div class="row" style="font-size: 11px;">
      <span>Comanda: ${data.tabLabel}</span>
    </div>
    <div class="double-line"></div>
    <div class="row bold" style="font-size: 11px; margin-bottom: 2px;">
      <span>QTD ITEM</span>
      <span>TOTAL</span>
    </div>
    <div class="dashed-line"></div>
    ${itemsHtml}
    <div class="double-line"></div>
    <div class="row">
      <span>SUBTOTAL:</span>
      <span class="right">${currencyFormatter.format(data.subtotalInCents / 100)}</span>
    </div>
    ${
      data.serviceFeeInCents !== undefined && data.serviceFeeInCents > 0
        ? `
      <div class="row">
        <span>TAXA SERVICO (${data.serviceFeePercent ?? 10}%):</span>
        <span class="right">${currencyFormatter.format(data.serviceFeeInCents / 100)}</span>
      </div>
    `
        : ''
    }
    <div class="double-line"></div>
    <div class="row bold large-title" style="margin: 4px 0;">
      <span>TOTAL A PAGAR:</span>
      <span>${currencyFormatter.format(data.totalInCents / 100)}</span>
    </div>
    <div class="double-line"></div>
    ${splitHtml}
    <div class="center" style="margin-top: 10px; font-size: 11px;">
      Obrigado pela preferencia!
    </div>
    <div class="center" style="margin-top: 2px; font-size: 9px; letter-spacing: 1px;">
      ELOZI SISTEMAS
    </div>
  `;
}

export function generateKitchenTicketHtml(
  data: ThermalKitchenTicketData,
): string {
  const dateStr = data.timestamp
    ? timeOnlyFormatter.format(new Date(data.timestamp))
    : timeOnlyFormatter.format(new Date());

  return `
    <div class="center bold title" style="border: 2px solid #000000; padding: 4px; margin-bottom: 4px;">
      VIA DE PRODUCAO: ${data.stationName.toUpperCase()}
    </div>
    <div class="row bold large-title" style="font-size: 20px; margin: 4px 0;">
      <span>MESA:</span>
      <span>${data.tableName.toUpperCase()}</span>
    </div>
    <div class="row" style="font-size: 11px;">
      <span>Horario: ${dateStr}</span>
      ${data.orderId ? `<span>#${data.orderId.slice(0, 6).toUpperCase()}</span>` : ''}
    </div>
    <div class="double-line"></div>
    <div style="margin: 8px 0;">
      <div style="font-size: 22px; font-weight: 900; line-height: 1.15; word-break: break-word;">
        ${data.quantity}x ${data.productName.toUpperCase()}
      </div>
      ${
        data.notes
          ? `
        <div style="border: 2px dashed #000000; padding: 6px; margin-top: 6px; font-size: 13px; font-weight: bold; background: #ffffff;">
          OBS: ${data.notes.toUpperCase()}
        </div>
      `
          : ''
      }
    </div>
    <div class="double-line"></div>
    <div class="center bold" style="font-size: 10px;">
      *** AGUARDANDO PRODUCAO ***
    </div>
  `;
}

export function printThermalReceipt(
  htmlContent: string,
  paperWidth: '80mm' | '58mm' = '80mm',
) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const effectiveWidth = paperWidth === '58mm' ? '48mm' : '72mm';
  const pageSize = paperWidth === '58mm' ? '58mm auto' : '80mm auto';

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    window.print();
    return;
  }

  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Cupom Termico</title>
  <style>
    @page {
      size: ${pageSize};
      margin: 0;
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
      }
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.25;
      color: #000000 !important;
      background: #ffffff !important;
      width: ${effectiveWidth};
      max-width: ${effectiveWidth};
      margin: 0 auto;
      padding: 3mm;
      font-weight: 500;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .left { text-align: left; }
    .bold { font-weight: bold; }
    .dashed-line {
      border-top: 1px dashed #000000;
      margin: 4px 0;
    }
    .double-line {
      border-top: 2px solid #000000;
      margin: 4px 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 6px;
    }
    .title {
      font-size: 14px;
      font-weight: bold;
    }
    .large-title {
      font-size: 16px;
      font-weight: bold;
    }
    .obs-box {
      border: 1px dashed #000000;
      padding: 4px;
      margin-top: 4px;
      font-size: 11px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        try {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        } catch {}
      }, 2500);
    }
  }, 300);
}

export function printTableBillThermal(data: ThermalBillData) {
  const html = generateBillReceiptHtml(data);
  printThermalReceipt(html, data.paperWidth ?? '80mm');
}

export function printKitchenTicketThermal(data: ThermalKitchenTicketData) {
  const html = generateKitchenTicketHtml(data);
  printThermalReceipt(html, data.paperWidth ?? '80mm');
}

export function ThermalPrinterIcon({ className = 'w-4 h-4' }: { className?: string }) {
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
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect width="12" height="8" x="6" y="14" />
    </svg>
  );
}
