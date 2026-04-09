import { describe, it, expect } from "vitest";
import {
  buildCfdiXml,
  buildPaymentComplementXml,
  buildNominaCfdiXml,
  escapeXml,
  type CfdiData,
  type PaymentComplementData,
  type NominaCfdiData,
} from "./cfdi-xml-builder";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function baseCfdiData(): CfdiData {
  return {
    serie: "A",
    folio: "100",
    fecha: "2026-04-08T12:00:00",
    formaPago: "01",
    metodoPago: "PUE",
    tipoComprobante: "I",
    moneda: "MXN",
    lugarExpedicion: "06600",
    exportacion: "01",
    emisorRfc: "EMP010101AAA",
    emisorNombre: "Luka Poke S.A. de C.V.",
    emisorRegimenFiscal: "601",
    receptorRfc: "XAXX010101000",
    receptorNombre: "Publico General",
    receptorUsoCfdi: "G03",
    receptorRegimenFiscal: "616",
    receptorDomicilioFiscal: "06600",
    conceptos: [
      {
        claveProdServ: "50181700",
        cantidad: 2,
        claveUnidad: "H87",
        unidad: "Pieza",
        descripcion: "Poke bowl clasico",
        valorUnitario: 150,
        importe: 300,
        objetoImp: "02",
        impuestos: {
          traslados: [
            {
              base: 300,
              impuesto: "002",
              tipoFactor: "Tasa",
              tasaOCuota: 0.16,
              importe: 48,
            },
          ],
        },
      },
    ],
    subtotal: 300,
    total: 348,
    totalImpuestosTrasladados: 48,
  };
}

function basePaymentData(): PaymentComplementData {
  return {
    serie: "P",
    folio: "50",
    fecha: "2026-04-08T12:00:00",
    lugarExpedicion: "06600",
    exportacion: "01",
    emisorRfc: "EMP010101AAA",
    emisorNombre: "Luka Poke S.A. de C.V.",
    emisorRegimenFiscal: "601",
    receptorRfc: "XAXX010101000",
    receptorNombre: "Publico General",
    receptorRegimenFiscal: "616",
    receptorDomicilioFiscal: "06600",
    pagos: [
      {
        fechaPago: "2026-04-08T12:00:00",
        formaDePagoP: "01",
        monedaP: "MXN",
        monto: 348,
        doctosRelacionados: [
          {
            idDocumento: "aabb-ccdd-eeff",
            serie: "A",
            folio: "100",
            monedaDR: "MXN",
            numParcialidad: 1,
            impSaldoAnt: 348,
            impPagado: 348,
            impSaldoInsoluto: 0,
            objetoImpDR: "02",
          },
        ],
      },
    ],
  };
}

function baseNominaData(): NominaCfdiData {
  return {
    serie: "N",
    folio: "200",
    fecha: "2026-04-15T00:00:00",
    lugarExpedicion: "06600",
    exportacion: "01",
    emisorRfc: "EMP010101AAA",
    emisorNombre: "Luka Poke S.A. de C.V.",
    emisorRegimenFiscal: "601",
    registroPatronal: "A1234567890",
    receptorRfc: "GARC920101ABC",
    receptorNombre: "Garcia Carlos",
    receptorCurp: "GARC920101HDFRRL09",
    receptorDomicilioFiscal: "06600",
    receptorRegimenFiscal: "605",
    numSeguridadSocial: "12345678901",
    fechaInicioRelLaboral: "2024-01-15",
    antiguedad: "P117W",
    tipoContrato: "01",
    tipoJornada: "01",
    tipoRegimen: "02",
    numEmpleado: "EMP-001",
    puesto: "Cocinero",
    periodicidadPago: "04",
    claveEntFed: "DIF",
    tipoNomina: "O",
    fechaPago: "2026-04-15",
    fechaInicialPago: "2026-04-01",
    fechaFinalPago: "2026-04-15",
    numDiasPagados: 15,
    totalPercepciones: 7500,
    totalDeducciones: 958.13,
    totalOtrosPagos: 0,
    totalSueldos: 7500,
    totalGravado: 7500,
    totalExento: 0,
    percepciones: [
      {
        tipoPercepcion: "001",
        clave: "001",
        concepto: "Sueldo",
        importeGravado: 7500,
        importeExento: 0,
      },
    ],
    deducciones: [
      {
        tipoDeduccion: "002",
        clave: "002",
        concepto: "ISR",
        importe: 750,
      },
      {
        tipoDeduccion: "001",
        clave: "001",
        concepto: "IMSS",
        importe: 208.13,
      },
    ],
    totalOtrasDeducciones: 208.13,
    totalImpuestosRetenidos: 750,
    otrosPagos: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("CFDI XML Builder", () => {
  // -----------------------------------------------------------------------
  // escapeXml
  // -----------------------------------------------------------------------
  describe("escapeXml", () => {
    it("should escape ampersands, angle brackets, and quotes", () => {
      expect(escapeXml('Tom & Jerry <"friends">')).toBe(
        "Tom &amp; Jerry &lt;&quot;friends&quot;&gt;",
      );
    });

    it("should escape apostrophes", () => {
      expect(escapeXml("it's")).toBe("it&apos;s");
    });
  });

  // -----------------------------------------------------------------------
  // buildCfdiXml
  // -----------------------------------------------------------------------
  describe("buildCfdiXml", () => {
    it("should generate XML with correct CFDI 4.0 namespace and version", () => {
      const xml = buildCfdiXml(baseCfdiData());

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('xmlns:cfdi="http://www.sat.gob.mx/cfd/4"');
      expect(xml).toContain('Version="4.0"');
    });

    it("should include Serie and Folio attributes", () => {
      const xml = buildCfdiXml(baseCfdiData());

      expect(xml).toContain('Serie="A"');
      expect(xml).toContain('Folio="100"');
    });

    it("should include FormaPago, MetodoPago, and TipoDeComprobante", () => {
      const xml = buildCfdiXml(baseCfdiData());

      expect(xml).toContain('FormaPago="01"');
      expect(xml).toContain('MetodoPago="PUE"');
      expect(xml).toContain('TipoDeComprobante="I"');
    });

    it("should include Emisor with RFC, Nombre, and RegimenFiscal", () => {
      const xml = buildCfdiXml(baseCfdiData());

      expect(xml).toContain('Rfc="EMP010101AAA"');
      expect(xml).toContain('RegimenFiscal="601"');
      expect(xml).toContain("<cfdi:Emisor");
    });

    it("should include Receptor with UsoCFDI and DomicilioFiscalReceptor", () => {
      const xml = buildCfdiXml(baseCfdiData());

      expect(xml).toContain("<cfdi:Receptor");
      expect(xml).toContain('UsoCFDI="G03"');
      expect(xml).toContain('DomicilioFiscalReceptor="06600"');
    });

    it("should include Conceptos with correct amounts", () => {
      const xml = buildCfdiXml(baseCfdiData());

      expect(xml).toContain("<cfdi:Conceptos>");
      expect(xml).toContain('ClaveProdServ="50181700"');
      expect(xml).toContain('ValorUnitario="150.00"');
      expect(xml).toContain('Importe="300.00"');
    });

    it("should include IVA tax traslado in concepto and in totals", () => {
      const xml = buildCfdiXml(baseCfdiData());

      expect(xml).toContain('Impuesto="002"');
      expect(xml).toContain('TasaOCuota="0.160000"');
      expect(xml).toContain('TotalImpuestosTrasladados="48.00"');
    });

    it("should include SubTotal and Total formatted to 2 decimals", () => {
      const xml = buildCfdiXml(baseCfdiData());

      expect(xml).toContain('SubTotal="300.00"');
      expect(xml).toContain('Total="348.00"');
    });

    it("should omit Descuento attribute when not provided or zero", () => {
      const data = baseCfdiData();
      const xml = buildCfdiXml(data);

      // The Comprobante level should not have Descuento
      expect(xml).not.toMatch(/Comprobante[^>]*Descuento/);
    });

    it("should include TipoCambio when provided", () => {
      const data = baseCfdiData();
      data.moneda = "USD";
      data.tipoCambio = 17.25;
      const xml = buildCfdiXml(data);

      expect(xml).toContain('TipoCambio="17.25"');
    });
  });

  // -----------------------------------------------------------------------
  // buildPaymentComplementXml
  // -----------------------------------------------------------------------
  describe("buildPaymentComplementXml", () => {
    it("should generate Pagos 2.0 complement with correct namespace", () => {
      const xml = buildPaymentComplementXml(basePaymentData());

      expect(xml).toContain('xmlns:pago20="http://www.sat.gob.mx/Pagos20"');
      expect(xml).toContain('Version="2.0"');
    });

    it("should have TipoDeComprobante P with SubTotal and Total of 0", () => {
      const xml = buildPaymentComplementXml(basePaymentData());

      expect(xml).toContain('TipoDeComprobante="P"');
      expect(xml).toContain('SubTotal="0"');
      expect(xml).toContain('Total="0"');
    });

    it("should use Moneda XXX for payment complement", () => {
      const xml = buildPaymentComplementXml(basePaymentData());

      expect(xml).toContain('Moneda="XXX"');
    });

    it("should include the fixed concepto ClaveProdServ 84111506", () => {
      const xml = buildPaymentComplementXml(basePaymentData());

      expect(xml).toContain('ClaveProdServ="84111506"');
      expect(xml).toContain('ClaveUnidad="ACT"');
    });

    it("should include pago20:Pago with FechaPago and Monto", () => {
      const xml = buildPaymentComplementXml(basePaymentData());

      expect(xml).toContain("pago20:Pago");
      expect(xml).toContain('FormaDePagoP="01"');
      expect(xml).toContain('Monto="348.00"');
    });

    it("should include DoctoRelacionado with saldo and parcialidad", () => {
      const xml = buildPaymentComplementXml(basePaymentData());

      expect(xml).toContain('IdDocumento="aabb-ccdd-eeff"');
      expect(xml).toContain('NumParcialidad="1"');
      expect(xml).toContain('ImpSaldoAnt="348.00"');
      expect(xml).toContain('ImpPagado="348.00"');
      expect(xml).toContain('ImpSaldoInsoluto="0.00"');
    });

    it("should calculate and include MontoTotalPagos", () => {
      const xml = buildPaymentComplementXml(basePaymentData());

      expect(xml).toContain('MontoTotalPagos="348.00"');
    });
  });

  // -----------------------------------------------------------------------
  // buildNominaCfdiXml
  // -----------------------------------------------------------------------
  describe("buildNominaCfdiXml", () => {
    it("should generate Nomina 1.2 complement with correct namespace", () => {
      const xml = buildNominaCfdiXml(baseNominaData());

      expect(xml).toContain('xmlns:nomina12="http://www.sat.gob.mx/nomina12"');
      expect(xml).toContain('Version="1.2"');
    });

    it("should set TipoDeComprobante to N and Moneda to MXN", () => {
      const xml = buildNominaCfdiXml(baseNominaData());

      expect(xml).toContain('TipoDeComprobante="N"');
      expect(xml).toContain('Moneda="MXN"');
    });

    it("should compute SubTotal as totalPercepciones + totalOtrosPagos", () => {
      const xml = buildNominaCfdiXml(baseNominaData());

      // 7500 + 0 = 7500
      expect(xml).toContain('SubTotal="7500.00"');
    });

    it("should set Descuento equal to totalDeducciones", () => {
      const xml = buildNominaCfdiXml(baseNominaData());

      expect(xml).toContain('Descuento="958.13"');
    });

    it("should compute Total as SubTotal minus Descuento", () => {
      const xml = buildNominaCfdiXml(baseNominaData());

      // 7500 - 958.13 = 6541.87
      expect(xml).toContain('Total="6541.87"');
    });

    it("should include the fixed concepto ClaveProdServ 84111505", () => {
      const xml = buildNominaCfdiXml(baseNominaData());

      expect(xml).toContain('ClaveProdServ="84111505"');
      expect(xml).toContain('ClaveUnidad="ACT"');
    });

    it("should include nomina12:Receptor with CURP and NSS", () => {
      const xml = buildNominaCfdiXml(baseNominaData());

      expect(xml).toContain('Curp="GARC920101HDFRRL09"');
      expect(xml).toContain('NumSeguridadSocial="12345678901"');
      expect(xml).toContain('NumEmpleado="EMP-001"');
    });

    it("should include percepciones and deducciones", () => {
      const xml = buildNominaCfdiXml(baseNominaData());

      expect(xml).toContain("nomina12:Percepciones");
      expect(xml).toContain('TipoPercepcion="001"');
      expect(xml).toContain('ImporteGravado="7500.00"');

      expect(xml).toContain("nomina12:Deducciones");
      expect(xml).toContain('TipoDeduccion="002"');
      expect(xml).toContain('Importe="750.00"');
    });

    it("should include UsoCFDI CN01 for payroll receipts", () => {
      const xml = buildNominaCfdiXml(baseNominaData());

      expect(xml).toContain('UsoCFDI="CN01"');
    });
  });
});
