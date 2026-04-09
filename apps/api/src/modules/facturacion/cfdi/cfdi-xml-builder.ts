export interface CfdiConceptoImpuesto {
  base: number;
  impuesto: string; // "002" = IVA
  tipoFactor: string; // "Tasa"
  tasaOCuota: number; // 0.160000
  importe: number;
}

export interface CfdiConcepto {
  claveProdServ: string;
  cantidad: number;
  claveUnidad: string;
  unidad: string;
  descripcion: string;
  valorUnitario: number;
  importe: number;
  descuento?: number;
  objetoImp: string; // "01" no aplica, "02" si, "03" si parcial
  impuestos?: {
    traslados?: CfdiConceptoImpuesto[];
    retenciones?: CfdiConceptoImpuesto[];
  };
}

export interface CfdiData {
  serie: string;
  folio: string;
  fecha: string; // ISO format
  formaPago: string;
  metodoPago: string;
  tipoComprobante: string;
  moneda: string;
  tipoCambio?: number;
  lugarExpedicion: string; // CP
  exportacion: string; // "01" no aplica, "02" definitiva, "03" temporal

  // Emisor
  emisorRfc: string;
  emisorNombre: string;
  emisorRegimenFiscal: string;

  // Receptor
  receptorRfc: string;
  receptorNombre: string;
  receptorUsoCfdi: string;
  receptorRegimenFiscal: string;
  receptorDomicilioFiscal: string;

  // Conceptos
  conceptos: CfdiConcepto[];

  subtotal: number;
  descuento?: number;
  total: number;

  // Impuestos totales
  totalImpuestosTrasladados?: number;
  totalImpuestosRetenidos?: number;
}

/**
 * Escapes special XML characters in a string to prevent malformed XML output.
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Formats a number to 2 decimal places as required by SAT.
 */
function fmtAmount(n: number): string {
  return n.toFixed(2);
}

/**
 * Formats a number to 6 decimal places for tax rates (tasaOCuota).
 */
function fmtRate(n: number): string {
  return n.toFixed(6);
}

/**
 * Builds the cfdi:Impuestos block for a single concepto, including
 * traslados and retenciones sub-elements when present.
 */
function buildConceptoImpuestos(
  impuestos: CfdiConcepto["impuestos"],
): string {
  if (!impuestos) return "";

  const hasTraslados =
    impuestos.traslados && impuestos.traslados.length > 0;
  const hasRetenciones =
    impuestos.retenciones && impuestos.retenciones.length > 0;

  if (!hasTraslados && !hasRetenciones) return "";

  let xml = "        <cfdi:Impuestos>\n";

  if (hasTraslados) {
    xml += "          <cfdi:Traslados>\n";
    for (const t of impuestos.traslados!) {
      xml +=
        `            <cfdi:Traslado Base="${fmtAmount(t.base)}"` +
        ` Impuesto="${t.impuesto}"` +
        ` TipoFactor="${t.tipoFactor}"` +
        ` TasaOCuota="${fmtRate(t.tasaOCuota)}"` +
        ` Importe="${fmtAmount(t.importe)}"/>\n`;
    }
    xml += "          </cfdi:Traslados>\n";
  }

  if (hasRetenciones) {
    xml += "          <cfdi:Retenciones>\n";
    for (const r of impuestos.retenciones!) {
      xml +=
        `            <cfdi:Retencion Base="${fmtAmount(r.base)}"` +
        ` Impuesto="${r.impuesto}"` +
        ` TipoFactor="${r.tipoFactor}"` +
        ` TasaOCuota="${fmtRate(r.tasaOCuota)}"` +
        ` Importe="${fmtAmount(r.importe)}"/>\n`;
    }
    xml += "          </cfdi:Retenciones>\n";
  }

  xml += "        </cfdi:Impuestos>";
  return xml;
}

/**
 * Builds a single cfdi:Concepto XML element including its nested
 * impuestos block when applicable.
 */
function buildConcepto(concepto: CfdiConcepto): string {
  const descuentoAttr =
    concepto.descuento != null && concepto.descuento > 0
      ? ` Descuento="${fmtAmount(concepto.descuento)}"`
      : "";

  const impuestosXml = buildConceptoImpuestos(concepto.impuestos);

  if (impuestosXml) {
    return (
      `      <cfdi:Concepto ClaveProdServ="${concepto.claveProdServ}"` +
      ` Cantidad="${concepto.cantidad}"` +
      ` ClaveUnidad="${concepto.claveUnidad}"` +
      ` Unidad="${escapeXml(concepto.unidad)}"` +
      ` Descripcion="${escapeXml(concepto.descripcion)}"` +
      ` ValorUnitario="${fmtAmount(concepto.valorUnitario)}"` +
      ` Importe="${fmtAmount(concepto.importe)}"` +
      descuentoAttr +
      ` ObjetoImp="${concepto.objetoImp}">\n` +
      impuestosXml +
      "\n      </cfdi:Concepto>"
    );
  }

  return (
    `      <cfdi:Concepto ClaveProdServ="${concepto.claveProdServ}"` +
    ` Cantidad="${concepto.cantidad}"` +
    ` ClaveUnidad="${concepto.claveUnidad}"` +
    ` Unidad="${escapeXml(concepto.unidad)}"` +
    ` Descripcion="${escapeXml(concepto.descripcion)}"` +
    ` ValorUnitario="${fmtAmount(concepto.valorUnitario)}"` +
    ` Importe="${fmtAmount(concepto.importe)}"` +
    descuentoAttr +
    ` ObjetoImp="${concepto.objetoImp}"/>`
  );
}

/**
 * Builds the global cfdi:Impuestos element with aggregated totals
 * for all traslados and retenciones across all conceptos.
 */
function buildImpuestosTotales(data: CfdiData): string {
  const hasTraslados =
    data.totalImpuestosTrasladados != null &&
    data.totalImpuestosTrasladados > 0;
  const hasRetenciones =
    data.totalImpuestosRetenidos != null &&
    data.totalImpuestosRetenidos > 0;

  if (!hasTraslados && !hasRetenciones) return "";

  // Aggregate individual tax lines from all concepts for the summary
  const trasladosMap = new Map<
    string,
    { impuesto: string; tipoFactor: string; tasaOCuota: number; importe: number }
  >();
  const retencionesMap = new Map<
    string,
    { impuesto: string; tipoFactor: string; tasaOCuota: number; importe: number }
  >();

  for (const c of data.conceptos) {
    if (c.impuestos?.traslados) {
      for (const t of c.impuestos.traslados) {
        const key = `${t.impuesto}-${t.tipoFactor}-${t.tasaOCuota}`;
        const existing = trasladosMap.get(key);
        if (existing) {
          existing.importe += t.importe;
        } else {
          trasladosMap.set(key, { ...t });
        }
      }
    }
    if (c.impuestos?.retenciones) {
      for (const r of c.impuestos.retenciones) {
        const key = `${r.impuesto}-${r.tipoFactor}-${r.tasaOCuota}`;
        const existing = retencionesMap.get(key);
        if (existing) {
          existing.importe += r.importe;
        } else {
          retencionesMap.set(key, { ...r });
        }
      }
    }
  }

  let xml = "  <cfdi:Impuestos";
  if (hasTraslados) {
    xml += ` TotalImpuestosTrasladados="${fmtAmount(data.totalImpuestosTrasladados!)}"`;
  }
  if (hasRetenciones) {
    xml += ` TotalImpuestosRetenidos="${fmtAmount(data.totalImpuestosRetenidos!)}"`;
  }
  xml += ">\n";

  if (hasRetenciones && retencionesMap.size > 0) {
    xml += "    <cfdi:Retenciones>\n";
    for (const r of retencionesMap.values()) {
      xml +=
        `      <cfdi:Retencion Impuesto="${r.impuesto}"` +
        ` Importe="${fmtAmount(r.importe)}"/>\n`;
    }
    xml += "    </cfdi:Retenciones>\n";
  }

  if (hasTraslados && trasladosMap.size > 0) {
    xml += "    <cfdi:Traslados>\n";
    for (const t of trasladosMap.values()) {
      xml +=
        `      <cfdi:Traslado Impuesto="${t.impuesto}"` +
        ` TipoFactor="${t.tipoFactor}"` +
        ` TasaOCuota="${fmtRate(t.tasaOCuota)}"` +
        ` Importe="${fmtAmount(t.importe)}"/>\n`;
    }
    xml += "    </cfdi:Traslados>\n";
  }

  xml += "  </cfdi:Impuestos>";
  return xml;
}

/**
 * Builds a complete CFDI 4.0 XML string from structured invoice data.
 *
 * The generated XML follows the SAT CFDI 4.0 schema (cfdv40.xsd) and includes:
 * - cfdi:Comprobante root with all required namespace declarations
 * - cfdi:Emisor with RFC, name, and tax regime
 * - cfdi:Receptor with RFC, name, CFDI usage, tax regime, and fiscal address
 * - cfdi:Conceptos with per-concept tax breakdowns
 * - cfdi:Impuestos with aggregated tax totals
 *
 * NOTE: This XML is pre-timbrado. It must be sent to a PAC for digital
 * stamping (sello, cadena original, timbre fiscal) before it becomes
 * a valid fiscal document.
 */
// -------------------------------------------------------
// Payment Complement (Complemento de Pago 2.0) types
// -------------------------------------------------------

export interface PaymentComplementDoctoRelacionado {
  idDocumento: string; // UUID of related CFDI
  serie: string;
  folio: string;
  monedaDR: string;
  numParcialidad: number;
  impSaldoAnt: number;
  impPagado: number;
  impSaldoInsoluto: number;
  objetoImpDR: string; // "01", "02", "03"
  impuestosDR?: {
    trasladosDR?: Array<{
      baseDR: number;
      impuestoDR: string; // "002" = IVA
      tipoFactorDR: string; // "Tasa"
      tasaOCuotaDR: number; // 0.160000
      importeDR: number;
    }>;
    retencionesDR?: Array<{
      baseDR: number;
      impuestoDR: string;
      tipoFactorDR: string;
      tasaOCuotaDR: number;
      importeDR: number;
    }>;
  };
}

export interface PaymentComplementPago {
  fechaPago: string; // ISO format
  formaDePagoP: string; // SAT payment form code
  monedaP: string;
  monto: number;
  tipoCambioP?: number;
  doctosRelacionados: PaymentComplementDoctoRelacionado[];
}

export interface PaymentComplementData {
  serie: string;
  folio: string;
  fecha: string;
  lugarExpedicion: string;
  exportacion: string;

  // Emisor
  emisorRfc: string;
  emisorNombre: string;
  emisorRegimenFiscal: string;

  // Receptor
  receptorRfc: string;
  receptorNombre: string;
  receptorRegimenFiscal: string;
  receptorDomicilioFiscal: string;

  // Pagos
  pagos: PaymentComplementPago[];
}

/**
 * Builds the pago20:ImpuestosDR block for a related document.
 */
function buildImpuestosDR(
  impuestos: PaymentComplementDoctoRelacionado["impuestosDR"],
): string {
  if (!impuestos) return "";

  const hasTraslados =
    impuestos.trasladosDR && impuestos.trasladosDR.length > 0;
  const hasRetenciones =
    impuestos.retencionesDR && impuestos.retencionesDR.length > 0;

  if (!hasTraslados && !hasRetenciones) return "";

  let xml = "              <pago20:ImpuestosDR>\n";

  if (hasTraslados) {
    xml += "                <pago20:TrasladosDR>\n";
    for (const t of impuestos.trasladosDR!) {
      xml +=
        `                  <pago20:TrasladoDR` +
        ` BaseDR="${fmtAmount(t.baseDR)}"` +
        ` ImpuestoDR="${t.impuestoDR}"` +
        ` TipoFactorDR="${t.tipoFactorDR}"` +
        ` TasaOCuotaDR="${fmtRate(t.tasaOCuotaDR)}"` +
        ` ImporteDR="${fmtAmount(t.importeDR)}"/>\n`;
    }
    xml += "                </pago20:TrasladosDR>\n";
  }

  if (hasRetenciones) {
    xml += "                <pago20:RetencionesDR>\n";
    for (const r of impuestos.retencionesDR!) {
      xml +=
        `                  <pago20:RetencionDR` +
        ` BaseDR="${fmtAmount(r.baseDR)}"` +
        ` ImpuestoDR="${r.impuestoDR}"` +
        ` TipoFactorDR="${r.tipoFactorDR}"` +
        ` TasaOCuotaDR="${fmtRate(r.tasaOCuotaDR)}"` +
        ` ImporteDR="${fmtAmount(r.importeDR)}"/>\n`;
    }
    xml += "                </pago20:RetencionesDR>\n";
  }

  xml += "              </pago20:ImpuestosDR>";
  return xml;
}

/**
 * Builds the pago20:ImpuestosP block (payment-level tax totals).
 */
function buildImpuestosP(pago: PaymentComplementPago): string {
  // Aggregate taxes from all related documents
  const trasladosMap = new Map<
    string,
    { impuestoP: string; tipoFactorP: string; tasaOCuotaP: number; importeP: number; baseP: number }
  >();
  const retencionesMap = new Map<
    string,
    { impuestoP: string; tipoFactorP: string; tasaOCuotaP: number; importeP: number }
  >();

  for (const doc of pago.doctosRelacionados) {
    if (doc.impuestosDR?.trasladosDR) {
      for (const t of doc.impuestosDR.trasladosDR) {
        const key = `${t.impuestoDR}-${t.tipoFactorDR}-${t.tasaOCuotaDR}`;
        const existing = trasladosMap.get(key);
        if (existing) {
          existing.importeP += t.importeDR;
          existing.baseP += t.baseDR;
        } else {
          trasladosMap.set(key, {
            impuestoP: t.impuestoDR,
            tipoFactorP: t.tipoFactorDR,
            tasaOCuotaP: t.tasaOCuotaDR,
            importeP: t.importeDR,
            baseP: t.baseDR,
          });
        }
      }
    }
    if (doc.impuestosDR?.retencionesDR) {
      for (const r of doc.impuestosDR.retencionesDR) {
        const key = `${r.impuestoDR}-${r.tipoFactorDR}-${r.tasaOCuotaDR}`;
        const existing = retencionesMap.get(key);
        if (existing) {
          existing.importeP += r.importeDR;
        } else {
          retencionesMap.set(key, {
            impuestoP: r.impuestoDR,
            tipoFactorP: r.tipoFactorDR,
            tasaOCuotaP: r.tasaOCuotaDR,
            importeP: r.importeDR,
          });
        }
      }
    }
  }

  if (trasladosMap.size === 0 && retencionesMap.size === 0) return "";

  let xml = "            <pago20:ImpuestosP>\n";

  if (retencionesMap.size > 0) {
    xml += "              <pago20:RetencionesP>\n";
    for (const r of retencionesMap.values()) {
      xml +=
        `                <pago20:RetencionP` +
        ` ImpuestoP="${r.impuestoP}"` +
        ` ImporteP="${fmtAmount(r.importeP)}"/>\n`;
    }
    xml += "              </pago20:RetencionesP>\n";
  }

  if (trasladosMap.size > 0) {
    xml += "              <pago20:TrasladosP>\n";
    for (const t of trasladosMap.values()) {
      xml +=
        `                <pago20:TrasladoP` +
        ` BaseP="${fmtAmount(t.baseP)}"` +
        ` ImpuestoP="${t.impuestoP}"` +
        ` TipoFactorP="${t.tipoFactorP}"` +
        ` TasaOCuotaP="${fmtRate(t.tasaOCuotaP)}"` +
        ` ImporteP="${fmtAmount(t.importeP)}"/>\n`;
    }
    xml += "              </pago20:TrasladosP>\n";
  }

  xml += "            </pago20:ImpuestosP>";
  return xml;
}

/**
 * Builds a CFDI 4.0 XML with Complemento de Pago 2.0 for partial payment
 * registration (PPD method).
 *
 * Follows SAT Complemento de Pago 2.0 schema:
 * - TipoDeComprobante = "P"
 * - SubTotal = "0", Total = "0"
 * - Single concepto: ClaveProdServ 84111506, ClaveUnidad ACT
 * - pago20:Pagos block with payment details and related documents
 *
 * NOTE: This XML is pre-timbrado. It must be sent to a PAC for digital
 * stamping before it becomes a valid fiscal document.
 */
export function buildPaymentComplementXml(data: PaymentComplementData): string {
  // Calculate MontoTotalPagos
  const montoTotalPagos = data.pagos.reduce((sum, p) => sum + p.monto, 0);

  // Build DoctoRelacionado elements for each pago
  const pagosXml = data.pagos
    .map((pago) => {
      const tipoCambioAttr =
        pago.tipoCambioP != null ? ` TipoCambioP="${pago.tipoCambioP}"` : "";

      const doctosXml = pago.doctosRelacionados
        .map((doc) => {
          const impuestosDRXml = buildImpuestosDR(doc.impuestosDR);

          if (impuestosDRXml) {
            return (
              `            <pago20:DoctoRelacionado` +
              ` IdDocumento="${doc.idDocumento}"` +
              ` Serie="${escapeXml(doc.serie)}"` +
              ` Folio="${escapeXml(doc.folio)}"` +
              ` MonedaDR="${doc.monedaDR}"` +
              ` NumParcialidad="${doc.numParcialidad}"` +
              ` ImpSaldoAnt="${fmtAmount(doc.impSaldoAnt)}"` +
              ` ImpPagado="${fmtAmount(doc.impPagado)}"` +
              ` ImpSaldoInsoluto="${fmtAmount(doc.impSaldoInsoluto)}"` +
              ` ObjetoImpDR="${doc.objetoImpDR}">\n` +
              impuestosDRXml +
              "\n            </pago20:DoctoRelacionado>"
            );
          }

          return (
            `            <pago20:DoctoRelacionado` +
            ` IdDocumento="${doc.idDocumento}"` +
            ` Serie="${escapeXml(doc.serie)}"` +
            ` Folio="${escapeXml(doc.folio)}"` +
            ` MonedaDR="${doc.monedaDR}"` +
            ` NumParcialidad="${doc.numParcialidad}"` +
            ` ImpSaldoAnt="${fmtAmount(doc.impSaldoAnt)}"` +
            ` ImpPagado="${fmtAmount(doc.impPagado)}"` +
            ` ImpSaldoInsoluto="${fmtAmount(doc.impSaldoInsoluto)}"` +
            ` ObjetoImpDR="${doc.objetoImpDR}"/>`
          );
        })
        .join("\n");

      const impuestosPXml = buildImpuestosP(pago);

      return (
        `          <pago20:Pago` +
        ` FechaPago="${pago.fechaPago}"` +
        ` FormaDePagoP="${pago.formaDePagoP}"` +
        ` MonedaP="${pago.monedaP}"` +
        ` Monto="${fmtAmount(pago.monto)}"` +
        tipoCambioAttr +
        `>\n` +
        doctosXml +
        "\n" +
        (impuestosPXml ? impuestosPXml + "\n" : "") +
        "          </pago20:Pago>"
      );
    })
    .join("\n");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<cfdi:Comprobante` +
    ` xmlns:cfdi="http://www.sat.gob.mx/cfd/4"` +
    ` xmlns:pago20="http://www.sat.gob.mx/Pagos20"` +
    ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
    ` xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/Pagos20 http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd"` +
    ` Version="4.0"` +
    ` Serie="${data.serie}"` +
    ` Folio="${data.folio}"` +
    ` Fecha="${data.fecha}"` +
    ` TipoDeComprobante="P"` +
    ` Moneda="XXX"` +
    ` LugarExpedicion="${data.lugarExpedicion}"` +
    ` Exportacion="${data.exportacion}"` +
    ` SubTotal="0"` +
    ` Total="0">\n` +
    `  <cfdi:Emisor` +
    ` Rfc="${data.emisorRfc}"` +
    ` Nombre="${escapeXml(data.emisorNombre)}"` +
    ` RegimenFiscal="${data.emisorRegimenFiscal}"/>\n` +
    `  <cfdi:Receptor` +
    ` Rfc="${data.receptorRfc}"` +
    ` Nombre="${escapeXml(data.receptorNombre)}"` +
    ` UsoCFDI="CP01"` +
    ` RegimenFiscalReceptor="${data.receptorRegimenFiscal}"` +
    ` DomicilioFiscalReceptor="${data.receptorDomicilioFiscal}"/>\n` +
    `  <cfdi:Conceptos>\n` +
    `    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/>\n` +
    `  </cfdi:Conceptos>\n` +
    `  <cfdi:Complemento>\n` +
    `    <pago20:Pagos Version="2.0">\n` +
    `      <pago20:Totales MontoTotalPagos="${fmtAmount(montoTotalPagos)}"/>\n` +
    pagosXml +
    "\n" +
    `    </pago20:Pagos>\n` +
    `  </cfdi:Complemento>\n` +
    `</cfdi:Comprobante>`;

  return xml;
}

// -------------------------------------------------------
// Nómina 1.2 Complement types
// -------------------------------------------------------

export interface NominaPercepcion {
  tipoPercepcion: string; // SAT catalog: 001=Sueldos, 002=Gratificación, 019=Horas extra, etc.
  clave: string;
  concepto: string;
  importeGravado: number;
  importeExento: number;
}

export interface NominaDeduccion {
  tipoDeduccion: string; // SAT catalog: 001=Seguridad social, 002=ISR, 004=Otros
  clave: string;
  concepto: string;
  importe: number;
}

export interface NominaOtroPago {
  tipoOtroPago: string; // SAT catalog: 002=Subsidio al empleo
  clave: string;
  concepto: string;
  importe: number;
  subsidioCausado?: number; // Required when tipoOtroPago = "002"
}

export interface NominaCfdiData {
  serie: string;
  folio: string;
  fecha: string; // ISO format
  lugarExpedicion: string; // CP del emisor
  exportacion: string; // "01" no aplica

  // Emisor
  emisorRfc: string;
  emisorNombre: string;
  emisorRegimenFiscal: string;
  registroPatronal: string;

  // Receptor (Employee)
  receptorRfc: string;
  receptorNombre: string;
  receptorCurp: string;
  receptorDomicilioFiscal: string; // CP del receptor
  receptorRegimenFiscal: string; // "605" Sueldos y salarios
  numSeguridadSocial: string;
  fechaInicioRelLaboral: string; // ISO date
  antiguedad: string; // "P52W" format (ISO 8601 weeks)
  tipoContrato: string; // SAT: 01=Permanente, 02=Temporal, 03=Estacional
  tipoJornada: string; // SAT: 01=Diurna, 02=Nocturna, 03=Mixta
  tipoRegimen: string; // SAT: 02=Sueldos y salarios
  numEmpleado: string;
  departamento?: string;
  puesto: string;
  periodicidadPago: string; // SAT: 02=Semanal, 04=Quincenal, 05=Mensual
  claveEntFed: string; // SAT state code

  // Nómina details
  tipoNomina: string; // "O" Ordinaria, "E" Extraordinaria
  fechaPago: string; // ISO date
  fechaInicialPago: string; // ISO date
  fechaFinalPago: string; // ISO date
  numDiasPagados: number;

  // Amounts
  totalPercepciones: number;
  totalDeducciones: number;
  totalOtrosPagos: number;

  // Percepciones breakdown
  totalSueldos: number;
  totalGravado: number;
  totalExento: number;
  percepciones: NominaPercepcion[];

  // Deducciones breakdown
  totalOtrasDeducciones: number;
  totalImpuestosRetenidos: number;
  deducciones: NominaDeduccion[];

  // Otros pagos (subsidio, etc.)
  otrosPagos: NominaOtroPago[];
}

/**
 * Builds a CFDI 4.0 XML with Complemento de Nómina 1.2 for payroll receipts.
 *
 * Follows SAT Nómina 1.2 schema:
 * - TipoDeComprobante = "N"
 * - Moneda = "MXN"
 * - Single concepto: ClaveProdServ 84111505, ClaveUnidad ACT
 * - nomina12:Nomina block with employee, perceptions, deductions, and other payments
 *
 * NOTE: This XML is pre-timbrado. It must be sent to a PAC for digital
 * stamping before it becomes a valid fiscal document.
 */
export function buildNominaCfdiXml(data: NominaCfdiData): string {
  const subtotal = data.totalPercepciones + data.totalOtrosPagos;
  const descuento = data.totalDeducciones;
  const total = subtotal - descuento;

  // Build Percepciones
  const percepcionesXml = data.percepciones
    .map(
      (p) =>
        `          <nomina12:Percepcion` +
        ` TipoPercepcion="${p.tipoPercepcion}"` +
        ` Clave="${p.clave}"` +
        ` Concepto="${escapeXml(p.concepto)}"` +
        ` ImporteGravado="${fmtAmount(p.importeGravado)}"` +
        ` ImporteExento="${fmtAmount(p.importeExento)}"/>`,
    )
    .join("\n");

  // Build Deducciones
  const deduccionesXml = data.deducciones
    .map(
      (d) =>
        `          <nomina12:Deduccion` +
        ` TipoDeduccion="${d.tipoDeduccion}"` +
        ` Clave="${d.clave}"` +
        ` Concepto="${escapeXml(d.concepto)}"` +
        ` Importe="${fmtAmount(d.importe)}"/>`,
    )
    .join("\n");

  // Build OtrosPagos
  let otrosPagosBlock = "";
  if (data.otrosPagos.length > 0) {
    const otrosPagosXml = data.otrosPagos
      .map((op) => {
        let opXml =
          `          <nomina12:OtroPago` +
          ` TipoOtroPago="${op.tipoOtroPago}"` +
          ` Clave="${op.clave}"` +
          ` Concepto="${escapeXml(op.concepto)}"` +
          ` Importe="${fmtAmount(op.importe)}"`;

        if (op.tipoOtroPago === "002" && op.subsidioCausado != null) {
          opXml +=
            `>\n` +
            `            <nomina12:SubsidioAlEmpleo SubsidioCausado="${fmtAmount(op.subsidioCausado)}"/>\n` +
            `          </nomina12:OtroPago>`;
        } else {
          opXml += `/>`;
        }
        return opXml;
      })
      .join("\n");

    otrosPagosBlock =
      `        <nomina12:OtrosPagos>\n` +
      otrosPagosXml +
      `\n        </nomina12:OtrosPagos>\n`;
  }

  // Departamento is optional
  const departamentoAttr = data.departamento
    ? ` Departamento="${escapeXml(data.departamento)}"`
    : "";

  // TotalOtrosPagos attribute
  const totalOtrosPagosAttr = data.totalOtrosPagos > 0
    ? ` TotalOtrosPagos="${fmtAmount(data.totalOtrosPagos)}"`
    : "";

  // TotalDeducciones attribute on Nomina node
  const totalDeduccionesAttr = data.totalDeducciones > 0
    ? ` TotalDeducciones="${fmtAmount(data.totalDeducciones)}"`
    : "";

  // TotalPercepciones attribute on Nomina node
  const totalPercepcionesAttr = data.totalPercepciones > 0
    ? ` TotalPercepciones="${fmtAmount(data.totalPercepciones)}"`
    : "";

  // Deducciones block
  let deduccionesBlock = "";
  if (data.deducciones.length > 0) {
    const totalOtrasDeduccionesAttr = data.totalOtrasDeducciones > 0
      ? ` TotalOtrasDeducciones="${fmtAmount(data.totalOtrasDeducciones)}"`
      : "";
    const totalImpuestosRetenidosAttr = data.totalImpuestosRetenidos > 0
      ? ` TotalImpuestosRetenidos="${fmtAmount(data.totalImpuestosRetenidos)}"`
      : "";

    deduccionesBlock =
      `        <nomina12:Deducciones${totalOtrasDeduccionesAttr}${totalImpuestosRetenidosAttr}>\n` +
      deduccionesXml +
      `\n        </nomina12:Deducciones>\n`;
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<cfdi:Comprobante` +
    ` xmlns:cfdi="http://www.sat.gob.mx/cfd/4"` +
    ` xmlns:nomina12="http://www.sat.gob.mx/nomina12"` +
    ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
    ` xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/nomina12 http://www.sat.gob.mx/sitio_internet/cfd/nomina/nomina12.xsd"` +
    ` Version="4.0"` +
    ` Serie="${data.serie}"` +
    ` Folio="${data.folio}"` +
    ` Fecha="${data.fecha}"` +
    ` TipoDeComprobante="N"` +
    ` Moneda="MXN"` +
    ` LugarExpedicion="${data.lugarExpedicion}"` +
    ` Exportacion="${data.exportacion}"` +
    ` SubTotal="${fmtAmount(subtotal)}"` +
    ` Descuento="${fmtAmount(descuento)}"` +
    ` Total="${fmtAmount(total)}">\n` +
    `  <cfdi:Emisor` +
    ` Rfc="${data.emisorRfc}"` +
    ` Nombre="${escapeXml(data.emisorNombre)}"` +
    ` RegimenFiscal="${data.emisorRegimenFiscal}"/>\n` +
    `  <cfdi:Receptor` +
    ` Rfc="${data.receptorRfc}"` +
    ` Nombre="${escapeXml(data.receptorNombre)}"` +
    ` UsoCFDI="CN01"` +
    ` RegimenFiscalReceptor="${data.receptorRegimenFiscal}"` +
    ` DomicilioFiscalReceptor="${data.receptorDomicilioFiscal}"/>\n` +
    `  <cfdi:Conceptos>\n` +
    `    <cfdi:Concepto ClaveProdServ="84111505" Cantidad="1" ClaveUnidad="ACT"` +
    ` Descripcion="Pago de nomina"` +
    ` ValorUnitario="${fmtAmount(subtotal)}"` +
    ` Importe="${fmtAmount(subtotal)}"` +
    ` Descuento="${fmtAmount(descuento)}"` +
    ` ObjetoImp="01"/>\n` +
    `  </cfdi:Conceptos>\n` +
    `  <cfdi:Complemento>\n` +
    `    <nomina12:Nomina` +
    ` xmlns:nomina12="http://www.sat.gob.mx/nomina12"` +
    ` Version="1.2"` +
    ` TipoNomina="${data.tipoNomina}"` +
    ` FechaPago="${data.fechaPago}"` +
    ` FechaInicialPago="${data.fechaInicialPago}"` +
    ` FechaFinalPago="${data.fechaFinalPago}"` +
    ` NumDiasPagados="${fmtAmount(data.numDiasPagados)}"` +
    totalPercepcionesAttr +
    totalDeduccionesAttr +
    totalOtrosPagosAttr +
    `>\n` +
    `      <nomina12:Emisor RegistroPatronal="${escapeXml(data.registroPatronal)}"/>\n` +
    `      <nomina12:Receptor` +
    ` Curp="${data.receptorCurp}"` +
    ` NumSeguridadSocial="${data.numSeguridadSocial}"` +
    ` FechaInicioRelLaboral="${data.fechaInicioRelLaboral}"` +
    ` Antigüedad="${data.antiguedad}"` +
    ` TipoContrato="${data.tipoContrato}"` +
    ` TipoJornada="${data.tipoJornada}"` +
    ` TipoRegimen="${data.tipoRegimen}"` +
    ` NumEmpleado="${escapeXml(data.numEmpleado)}"` +
    departamentoAttr +
    ` Puesto="${escapeXml(data.puesto)}"` +
    ` PeriodicidadPago="${data.periodicidadPago}"` +
    ` ClaveEntFed="${data.claveEntFed}"/>\n` +
    `      <nomina12:Percepciones` +
    ` TotalSueldos="${fmtAmount(data.totalSueldos)}"` +
    ` TotalGravado="${fmtAmount(data.totalGravado)}"` +
    ` TotalExento="${fmtAmount(data.totalExento)}">\n` +
    percepcionesXml +
    `\n      </nomina12:Percepciones>\n` +
    deduccionesBlock +
    otrosPagosBlock +
    `    </nomina12:Nomina>\n` +
    `  </cfdi:Complemento>\n` +
    `</cfdi:Comprobante>`;

  return xml;
}

export function buildCfdiXml(data: CfdiData): string {
  const tipoCambioAttr =
    data.tipoCambio != null ? ` TipoCambio="${data.tipoCambio}"` : "";
  const descuentoAttr =
    data.descuento != null && data.descuento > 0
      ? ` Descuento="${fmtAmount(data.descuento)}"`
      : "";

  const impuestosTotales = buildImpuestosTotales(data);

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<cfdi:Comprobante` +
    ` xmlns:cfdi="http://www.sat.gob.mx/cfd/4"` +
    ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
    ` xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"` +
    ` Version="4.0"` +
    ` Serie="${data.serie}"` +
    ` Folio="${data.folio}"` +
    ` Fecha="${data.fecha}"` +
    ` FormaPago="${data.formaPago}"` +
    ` MetodoPago="${data.metodoPago}"` +
    ` TipoDeComprobante="${data.tipoComprobante}"` +
    ` Moneda="${data.moneda}"` +
    tipoCambioAttr +
    ` LugarExpedicion="${data.lugarExpedicion}"` +
    ` Exportacion="${data.exportacion}"` +
    ` SubTotal="${fmtAmount(data.subtotal)}"` +
    descuentoAttr +
    ` Total="${fmtAmount(data.total)}">\n` +
    `  <cfdi:Emisor` +
    ` Rfc="${data.emisorRfc}"` +
    ` Nombre="${escapeXml(data.emisorNombre)}"` +
    ` RegimenFiscal="${data.emisorRegimenFiscal}"/>\n` +
    `  <cfdi:Receptor` +
    ` Rfc="${data.receptorRfc}"` +
    ` Nombre="${escapeXml(data.receptorNombre)}"` +
    ` UsoCFDI="${data.receptorUsoCfdi}"` +
    ` RegimenFiscalReceptor="${data.receptorRegimenFiscal}"` +
    ` DomicilioFiscalReceptor="${data.receptorDomicilioFiscal}"/>\n` +
    `  <cfdi:Conceptos>\n` +
    data.conceptos.map((c) => buildConcepto(c)).join("\n") +
    `\n  </cfdi:Conceptos>\n` +
    (impuestosTotales ? impuestosTotales + "\n" : "") +
    `</cfdi:Comprobante>`;

  return xml;
}
