import type jsPDF from "jspdf";

// ---------------------------------------------------------------------------
// Lazy-load jsPDF to avoid SSR issues
// ---------------------------------------------------------------------------

async function createDoc(): Promise<jsPDF> {
  const { default: JsPDF } = await import("jspdf");
  await import("jspdf-autotable");
  return new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
}

// ---------------------------------------------------------------------------
// Common helpers
// ---------------------------------------------------------------------------

function fmtMXN(value: number): string {
  return Number(value || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

function addHeader(doc: jsPDF, title: string, subtitle?: string): number {
  // Black header bar
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, doc.internal.pageSize.width, 35, "F");

  // LUKA POKE HOUSE text in white
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("LUKA POKE HOUSE", 14, 15);

  // Subtitle
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Sistema de Gestion", 14, 22);

  // Date
  doc.text(
    new Date().toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    14,
    29,
  );

  // Report title
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 50);

  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(subtitle, 14, 58);
  }

  return subtitle ? 65 : 58;
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Pagina ${i} de ${pageCount} | Generado por Luka System`,
      14,
      doc.internal.pageSize.height - 10,
    );
  }
}

// Shared autoTable theme
const TABLE_THEME = {
  headStyles: {
    fillColor: [0, 0, 0] as [number, number, number],
    textColor: [255, 255, 255] as [number, number, number],
    fontStyle: "bold" as const,
    fontSize: 9,
  },
  alternateRowStyles: {
    fillColor: [249, 249, 249] as [number, number, number],
  },
  styles: {
    fontSize: 9,
    cellPadding: 3,
  },
};

// ---------------------------------------------------------------------------
// 1. Inventory PDF
// ---------------------------------------------------------------------------

interface InventoryProduct {
  sku: string;
  name: string;
  category?: { name: string } | null;
  unitOfMeasure: string;
  costPerUnit: number | string;
  isActive: boolean;
}

export async function generateInventoryPDF(products: InventoryProduct[], branchName?: string) {
  const doc = await createDoc();
  const startY = addHeader(
    doc,
    "Reporte de Inventario",
    branchName ? `Sucursal: ${branchName}` : undefined,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    startY,
    head: [["SKU", "Producto", "Categoria", "Unidad", "Costo", "Activo"]],
    body: products.map((p) => [
      p.sku,
      p.name,
      p.category?.name ?? "—",
      p.unitOfMeasure,
      fmtMXN(Number(p.costPerUnit)),
      p.isActive ? "Si" : "No",
    ]),
    ...TABLE_THEME,
  });

  // Summary row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? startY + 20;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(`Total de productos: ${products.length}`, 14, finalY + 10);

  addFooter(doc);
  doc.save(`inventario_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ---------------------------------------------------------------------------
// 2. Invoice (CFDI) PDF
// ---------------------------------------------------------------------------

interface InvoiceConcept {
  quantity: number | string;
  satClaveProdServ: string;
  description: string;
  unitPrice: number | string;
  amount: number | string;
}

interface Invoice {
  series: string;
  folio: string;
  uuid: string | null;
  createdAt: string;
  issuerRfc: string;
  issuerName: string;
  issuerRegimen: string;
  receiverRfc: string;
  receiverName: string;
  receiverUsoCfdi: string;
  receiverRegimen: string | null;
  receiverDomicilioFiscal: string | null;
  subtotal: number | string;
  total: number | string;
  concepts: InvoiceConcept[];
}

export async function generateInvoicePDF(invoice: Invoice) {
  const doc = await createDoc();
  const startY = addHeader(doc, "Factura CFDI");

  const pageW = doc.internal.pageSize.width;
  let y = startY;

  // --- Invoice header info ---
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(`Serie-Folio: ${invoice.series || "—"}-${invoice.folio}`, 14, y);
  doc.text(`Fecha: ${new Date(invoice.createdAt).toLocaleDateString("es-MX")}`, pageW / 2, y);
  y += 6;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`UUID: ${invoice.uuid || "Pendiente de timbrado"}`, 14, y);
  y += 10;

  // --- Emisor ---
  doc.setFillColor(240, 240, 240);
  doc.rect(14, y, pageW - 28, 20, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("EMISOR", 18, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`RFC: ${invoice.issuerRfc}`, 18, y + 12);
  doc.text(`Nombre: ${invoice.issuerName}`, 80, y + 12);
  doc.text(`Regimen Fiscal: ${invoice.issuerRegimen}`, 18, y + 17);
  y += 26;

  // --- Receptor ---
  doc.setFillColor(240, 240, 240);
  doc.rect(14, y, pageW - 28, 25, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("RECEPTOR", 18, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`RFC: ${invoice.receiverRfc}`, 18, y + 12);
  doc.text(`Nombre: ${invoice.receiverName}`, 80, y + 12);
  doc.text(`Uso CFDI: ${invoice.receiverUsoCfdi}`, 18, y + 17);
  doc.text(`Regimen Fiscal: ${invoice.receiverRegimen || "—"}`, 80, y + 17);
  doc.text(`Domicilio Fiscal: ${invoice.receiverDomicilioFiscal || "—"}`, 18, y + 22);
  y += 31;

  // --- Items table ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    startY: y,
    head: [["Cantidad", "Clave", "Descripcion", "P. Unitario", "Importe"]],
    body: invoice.concepts.map((c) => [
      Number(c.quantity),
      c.satClaveProdServ,
      c.description,
      fmtMXN(Number(c.unitPrice)),
      fmtMXN(Number(c.amount)),
    ]),
    ...TABLE_THEME,
    columnStyles: {
      0: { halign: "center" as const },
      3: { halign: "right" as const },
      4: { halign: "right" as const },
    },
  });

  // --- Totals ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableEndY = (doc as any).lastAutoTable?.finalY ?? y + 20;
  let ty = tableEndY + 8;
  const subtotal = Number(invoice.subtotal);
  const total = Number(invoice.total);
  const iva = total - subtotal;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text("Subtotal:", pageW - 70, ty);
  doc.text(fmtMXN(subtotal), pageW - 16, ty, { align: "right" });
  ty += 6;
  doc.text("IVA:", pageW - 70, ty);
  doc.text(fmtMXN(iva), pageW - 16, ty, { align: "right" });
  ty += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Total:", pageW - 70, ty);
  doc.text(fmtMXN(total), pageW - 16, ty, { align: "right" });

  // --- CFDI footer note ---
  ty += 14;
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(130, 130, 130);
  doc.text("Este documento es una representacion impresa de un CFDI", 14, ty);

  addFooter(doc);
  doc.save(
    `factura_${invoice.series || ""}${invoice.folio}_${new Date().toISOString().slice(0, 10)}.pdf`,
  );
}

// ---------------------------------------------------------------------------
// 3. Payroll PDF
// ---------------------------------------------------------------------------

interface PayrollEmployee {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  rfc?: string;
  jobPosition?: string;
  dailySalary: number | string;
  branchId: string;
  isActive: boolean;
}

export async function generatePayrollPDF(
  employees: PayrollEmployee[],
  branchMap: Record<string, string>,
  period?: string,
) {
  const doc = await createDoc();
  const startY = addHeader(doc, "Reporte de Nomina", period ? `Periodo: ${period}` : undefined);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    startY,
    head: [["No. Empleado", "Nombre", "RFC", "Puesto", "Salario Diario", "Sucursal", "Estado"]],
    body: employees.map((e) => [
      e.employeeNumber,
      `${e.firstName} ${e.lastName}`,
      e.rfc || "—",
      e.jobPosition || "—",
      fmtMXN(Number(e.dailySalary)),
      branchMap[e.branchId] || "—",
      e.isActive ? "Activo" : "Inactivo",
    ]),
    ...TABLE_THEME,
  });

  // Summary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? startY + 20;
  const activeCount = employees.filter((e) => e.isActive).length;
  const totalMonthly = employees.reduce((s, e) => s + Number(e.dailySalary || 0) * 30, 0);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(`Total empleados: ${employees.length}`, 14, finalY + 10);
  doc.text(`Empleados activos: ${activeCount}`, 14, finalY + 16);
  doc.text(`Nomina mensual estimada: ${fmtMXN(totalMonthly)}`, 14, finalY + 22);

  addFooter(doc);
  doc.save(`nomina_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ---------------------------------------------------------------------------
// 4. Financial PDF (for investors)
// ---------------------------------------------------------------------------

interface BranchProfitability {
  branchName: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
  margin: number;
  transactions: number;
}

interface FinancialData {
  profitability: BranchProfitability[];
  startDate: string;
  endDate: string;
  roi?: {
    totalInvested: number;
    totalReturn: number;
    roi: number;
    annualizedRoi: number;
    paybackMonths: number;
  };
}

export async function generateFinancialPDF(data: FinancialData) {
  const doc = await createDoc();
  const pageW = doc.internal.pageSize.width;
  const startY = addHeader(
    doc,
    "Reporte Financiero",
    `Periodo: ${data.startDate} al ${data.endDate}`,
  );

  let y = startY;

  // --- Executive summary box ---
  const totalRevenue = data.profitability.reduce((s, b) => s + b.revenue, 0);
  const totalNetProfit = data.profitability.reduce((s, b) => s + b.netProfit, 0);
  const totalTransactions = data.profitability.reduce((s, b) => s + (b.transactions || 0), 0);
  const avgTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  doc.setFillColor(245, 245, 245);
  doc.roundedRect(14, y, pageW - 28, 36, 3, 3, "F");

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Resumen Ejecutivo", 20, y + 8);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const col1 = 20;
  const col2 = pageW / 2 + 5;
  doc.text(`Ingresos Totales: ${fmtMXN(totalRevenue)}`, col1, y + 16);
  doc.text(`Utilidad Neta: ${fmtMXN(totalNetProfit)}`, col2, y + 16);
  doc.text(`Transacciones: ${totalTransactions.toLocaleString("es-MX")}`, col1, y + 23);
  doc.text(`Ticket Promedio: ${fmtMXN(avgTicket)}`, col2, y + 23);

  if (data.roi) {
    doc.text(`ROI: ${data.roi.roi.toFixed(1)}%`, col1, y + 30);
    doc.text(`ROI Anualizado: ${data.roi.annualizedRoi.toFixed(1)}%`, col2, y + 30);
  }

  y += 44;

  // --- Profitability by branch table ---
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Balance por Sucursal", 14, y);
  y += 4;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    startY: y,
    head: [
      [
        "Sucursal",
        "Ingresos",
        "Costo Venta",
        "Utilidad Bruta",
        "Gastos Op.",
        "Utilidad Neta",
        "Margen",
      ],
    ],
    body: data.profitability.map((b) => [
      b.branchName,
      fmtMXN(b.revenue),
      fmtMXN(b.cogs),
      fmtMXN(b.grossProfit),
      fmtMXN(b.operatingExpenses),
      fmtMXN(b.netProfit),
      `${b.margin.toFixed(1)}%`,
    ]),
    ...TABLE_THEME,
    columnStyles: {
      1: { halign: "right" as const },
      2: { halign: "right" as const },
      3: { halign: "right" as const },
      4: { halign: "right" as const },
      5: { halign: "right" as const },
      6: { halign: "right" as const },
    },
  });

  // --- Totals row ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableEndY = (doc as any).lastAutoTable?.finalY ?? y + 20;
  const totalCogs = data.profitability.reduce((s, b) => s + b.cogs, 0);
  const totalGross = data.profitability.reduce((s, b) => s + b.grossProfit, 0);
  const totalOpex = data.profitability.reduce((s, b) => s + b.operatingExpenses, 0);
  const totalMargin = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    startY: tableEndY,
    body: [
      [
        { content: "TOTAL", styles: { fontStyle: "bold" } },
        {
          content: fmtMXN(totalRevenue),
          styles: { fontStyle: "bold", halign: "right" },
        },
        {
          content: fmtMXN(totalCogs),
          styles: { fontStyle: "bold", halign: "right" },
        },
        {
          content: fmtMXN(totalGross),
          styles: { fontStyle: "bold", halign: "right" },
        },
        {
          content: fmtMXN(totalOpex),
          styles: { fontStyle: "bold", halign: "right" },
        },
        {
          content: fmtMXN(totalNetProfit),
          styles: { fontStyle: "bold", halign: "right" },
        },
        {
          content: `${totalMargin.toFixed(1)}%`,
          styles: { fontStyle: "bold", halign: "right" },
        },
      ],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    theme: "plain",
  });

  addFooter(doc);
  doc.save(`reporte_financiero_${new Date().toISOString().slice(0, 10)}.pdf`);
}
