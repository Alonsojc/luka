import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  buildCfdiXml,
  buildPaymentComplementXml,
  CfdiData,
  CfdiConcepto,
  PaymentComplementData,
  PaymentComplementPago,
  PaymentComplementDoctoRelacionado,
} from "./cfdi/cfdi-xml-builder";
import { AuditService } from "../audit/audit.service";
import { PacService } from "./pac/pac.service";

/** Maps Prisma CFDIType enum values to SAT TipoDeComprobante claves. */
const CFDI_TYPE_MAP: Record<string, string> = {
  INGRESO: "I",
  EGRESO: "E",
  TRASLADO: "T",
  NOMINA: "N",
  PAGO: "P",
};

@Injectable()
export class FacturacionService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private pacService: PacService,
  ) {}

  // -------------------------------------------------------
  // Invoice CRUD
  // -------------------------------------------------------

  async findAllInvoices(organizationId: string) {
    return this.prisma.cFDI.findMany({
      where: { organizationId },
      include: {
        branch: true,
        concepts: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOneInvoice(organizationId: string, id: string) {
    const invoice = await this.prisma.cFDI.findFirst({
      where: { id, organizationId },
      include: {
        branch: true,
        concepts: true,
        relatedCfdis: true,
        paymentComplement: true,
      },
    });
    if (!invoice) {
      throw new NotFoundException("Factura no encontrada");
    }
    return invoice;
  }

  async createInvoice(
    organizationId: string,
    userId: string,
    data: {
      branchId: string;
      cfdiType: string;
      series?: string;
      folio?: string;
      issuerRfc: string;
      issuerName: string;
      issuerRegimen: string;
      receiverRfc: string;
      receiverName: string;
      receiverRegimen?: string;
      receiverUsoCfdi: string;
      currency?: string;
      exchangeRate?: number;
      paymentMethod?: string;
      paymentForm?: string;
      concepts: Array<{
        satClaveProdServ: string;
        quantity: number;
        unitOfMeasure: string;
        satClaveUnidad: string;
        description: string;
        unitPrice: number;
        discount?: number;
        taxDetails?: Record<string, any>;
      }>;
    },
  ) {
    const { concepts, cfdiType, ...cfdiData } = data;

    const subtotal = concepts.reduce((sum, c) => sum + c.quantity * c.unitPrice, 0);
    const totalDiscount = concepts.reduce((sum, c) => sum + (c.discount || 0), 0);

    const conceptsWithAmounts = concepts.map((c) => ({
      ...c,
      amount: Math.round(c.quantity * c.unitPrice * 100) / 100,
      discount: c.discount || 0,
      taxDetails: c.taxDetails || {},
    }));

    // IVA 16% on (subtotal - discount) as default
    const taxableAmount = subtotal - totalDiscount;
    const iva = Math.round(taxableAmount * 0.16 * 100) / 100;
    const total = Math.round((subtotal - totalDiscount + iva) * 100) / 100;

    const created = await this.prisma.cFDI.create({
      data: {
        organizationId,
        createdById: userId,
        cfdiType: cfdiType as any,
        ...cfdiData,
        subtotal: Math.round(subtotal * 100) / 100,
        discount: Math.round(totalDiscount * 100) / 100,
        total,
        concepts: {
          create: conceptsWithAmounts,
        },
      },
      include: { branch: true, concepts: true },
    });

    await this.auditService.log({
      organizationId,
      userId,
      action: "CREATE",
      module: "FACTURACION",
      entityType: "CFDI",
      entityId: created.id,
      description: `Factura ${cfdiType} creada - Receptor: ${data.receiverName} (${data.receiverRfc}) - Total: $${total}`,
    });

    return created;
  }

  async updateInvoice(
    organizationId: string,
    id: string,
    data: {
      receiverRfc?: string;
      receiverName?: string;
      receiverRegimen?: string;
      receiverUsoCfdi?: string;
      paymentMethod?: string;
      paymentForm?: string;
      attachments?: any;
      concepts?: Array<{
        satClaveProdServ: string;
        quantity: number;
        unitOfMeasure: string;
        satClaveUnidad: string;
        description: string;
        unitPrice: number;
        discount?: number;
        taxDetails?: Record<string, any>;
      }>;
    },
  ) {
    const invoice = await this.findOneInvoice(organizationId, id);

    // Attachments can be updated on any invoice (regardless of status)
    // but other fields can only be edited on DRAFT invoices
    const isAttachmentsOnly = Object.keys(data).length === 1 && data.attachments !== undefined;

    if (!isAttachmentsOnly && invoice.status !== "DRAFT") {
      throw new BadRequestException("Solo se pueden editar facturas en borrador");
    }

    const { concepts, ...invoiceData } = data;

    return this.prisma.$transaction(async (tx) => {
      if (concepts) {
        await tx.cFDIConcept.deleteMany({ where: { cfdiId: id } });

        const subtotal = concepts.reduce((sum, c) => sum + c.quantity * c.unitPrice, 0);
        const totalDiscount = concepts.reduce((sum, c) => sum + (c.discount || 0), 0);
        const taxableAmount = subtotal - totalDiscount;
        const iva = Math.round(taxableAmount * 0.16 * 100) / 100;
        const total = Math.round((subtotal - totalDiscount + iva) * 100) / 100;

        const conceptsWithAmounts = concepts.map((c) => ({
          cfdiId: id,
          ...c,
          amount: Math.round(c.quantity * c.unitPrice * 100) / 100,
          discount: c.discount || 0,
          taxDetails: c.taxDetails || {},
        }));

        await tx.cFDIConcept.createMany({ data: conceptsWithAmounts });

        return tx.cFDI.update({
          where: { id },
          data: {
            ...invoiceData,
            subtotal: Math.round(subtotal * 100) / 100,
            discount: Math.round(totalDiscount * 100) / 100,
            total,
          },
          include: { branch: true, concepts: true },
        });
      }

      return tx.cFDI.update({
        where: { id },
        data: invoiceData,
        include: { branch: true, concepts: true },
      });
    });
  }

  // -------------------------------------------------------
  // CFDI XML Generation
  // -------------------------------------------------------

  async generateXml(organizationId: string, id: string) {
    const invoice = await this.findOneInvoice(organizationId, id);

    if (invoice.status !== "DRAFT") {
      throw new BadRequestException("Solo se puede generar XML para facturas en borrador");
    }

    const cfdiData = this.buildCfdiDataFromInvoice(invoice);
    const xml = buildCfdiXml(cfdiData);

    // Send to PAC for timbrado
    const pacResult = await this.pacService.stamp(xml, cfdiData.emisorRfc);

    const updated = await this.prisma.cFDI.update({
      where: { id },
      data: {
        uuid: pacResult.uuid,
        xmlContent: pacResult.xmlTimbrado,
        status: "STAMPED",
        stampedAt: new Date(pacResult.fechaTimbrado),
      },
      include: { branch: true, concepts: true },
    });

    await this.auditService.log({
      organizationId,
      action: "XML_GENERATED",
      module: "FACTURACION",
      entityType: "CFDI",
      entityId: id,
      description: `XML generado para factura ${invoice.series || "A"}-${invoice.folio || id}`,
    });

    return { invoice: updated, xml };
  }

  async getXml(organizationId: string, id: string) {
    const invoice = await this.findOneInvoice(organizationId, id);

    if (!invoice.xmlContent) {
      throw new BadRequestException(
        "Esta factura no tiene XML generado. Use POST /facturacion/invoices/:id/xml primero.",
      );
    }

    const filename = `cfdi_${invoice.series || "A"}_${invoice.folio || id}.xml`;
    return { xml: invoice.xmlContent, filename };
  }

  // -------------------------------------------------------
  // Cancellation
  // -------------------------------------------------------

  async cancelInvoice(
    organizationId: string,
    id: string,
    motivo: string,
    folioSustitucion?: string,
  ) {
    const invoice = await this.findOneInvoice(organizationId, id);

    if (invoice.status === "CANCELLED") {
      throw new BadRequestException("La factura ya esta cancelada");
    }

    // Motivo "01" (errores con relacion) requires a substitute CFDI UUID
    if (motivo === "01" && !folioSustitucion) {
      throw new BadRequestException(
        "El motivo '01' requiere el UUID del CFDI sustituto (folioSustitucion)",
      );
    }

    // For stamped invoices, send cancellation request to PAC
    let cancelled;
    if (invoice.status === "STAMPED" && invoice.uuid) {
      const pacResult = await this.pacService.cancel(
        invoice.uuid,
        invoice.issuerRfc,
        motivo,
        folioSustitucion,
      );

      if (pacResult.success) {
        cancelled = await this.prisma.cFDI.update({
          where: { id },
          data: {
            status: "CANCELLED",
            cancellationReason: motivo,
            cancelledAt: new Date(pacResult.fechaCancelacion),
            ...(folioSustitucion ? { substituteCfdiId: folioSustitucion } : {}),
          },
          include: { branch: true, concepts: true },
        });
      } else {
        cancelled = await this.prisma.cFDI.update({
          where: { id },
          data: {
            status: "CANCELLATION_PENDING" as any,
            cancellationReason: motivo,
            ...(folioSustitucion ? { substituteCfdiId: folioSustitucion } : {}),
          },
          include: { branch: true, concepts: true },
        });
      }
    } else {
      // DRAFT invoices can be cancelled directly without PAC
      cancelled = await this.prisma.cFDI.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancellationReason: motivo,
          cancelledAt: new Date(),
          ...(folioSustitucion ? { substituteCfdiId: folioSustitucion } : {}),
        },
        include: { branch: true, concepts: true },
      });
    }

    await this.auditService.log({
      organizationId,
      action: "CANCEL",
      module: "FACTURACION",
      entityType: "CFDI",
      entityId: id,
      description: `Factura ${invoice.series || "A"}-${invoice.folio || id} cancelada - Motivo: ${motivo}`,
    });

    return cancelled;
  }

  // -------------------------------------------------------
  // Payment Complement (Complemento de Pago 2.0)
  // -------------------------------------------------------

  /**
   * Creates a Complemento de Pago CFDI for partial payments (PPD method).
   *
   * Validates that all related CFDIs use PPD payment method and are STAMPED,
   * calculates parcialidad numbers and balances, generates the CFDI type P
   * with Complemento de Pago 2.0 XML, and creates both the CFDI and
   * CFDIPaymentComplement records.
   */
  async createPaymentComplement(
    organizationId: string,
    userId: string,
    data: {
      paymentDate: string;
      paymentForm: string;
      amount: number;
      currency?: string;
      relatedDocuments: Array<{ cfdiId: string; amountPaid: number }>;
    },
  ) {
    const currency = data.currency || "MXN";

    if (!data.relatedDocuments || data.relatedDocuments.length === 0) {
      throw new BadRequestException("Debe seleccionar al menos un documento relacionado");
    }

    // Validate total of related payments matches amount
    const totalRelated = data.relatedDocuments.reduce((sum, d) => sum + d.amountPaid, 0);
    const roundedTotal = Math.round(totalRelated * 100) / 100;
    const roundedAmount = Math.round(data.amount * 100) / 100;
    if (roundedTotal !== roundedAmount) {
      throw new BadRequestException(
        `La suma de los pagos aplicados ($${roundedTotal}) no coincide con el monto total ($${roundedAmount})`,
      );
    }

    // Fetch all related CFDIs
    const relatedCfdis = await this.prisma.cFDI.findMany({
      where: {
        id: { in: data.relatedDocuments.map((d) => d.cfdiId) },
        organizationId,
      },
      include: {
        branch: true,
        concepts: true,
        paymentComplement: true,
      },
    });

    if (relatedCfdis.length !== data.relatedDocuments.length) {
      throw new BadRequestException("Una o mas facturas relacionadas no fueron encontradas");
    }

    // Validate all are PPD and STAMPED
    for (const cfdi of relatedCfdis) {
      if (cfdi.paymentMethod !== "PPD") {
        throw new BadRequestException(
          `La factura ${cfdi.series || "A"}-${cfdi.folio || cfdi.id} no usa metodo de pago PPD`,
        );
      }
      if (cfdi.status !== "STAMPED") {
        throw new BadRequestException(
          `La factura ${cfdi.series || "A"}-${cfdi.folio || cfdi.id} no esta timbrada (estado: ${cfdi.status})`,
        );
      }
    }

    // For each related CFDI, calculate parcialidad and balances
    const doctosRelacionados: PaymentComplementDoctoRelacionado[] = [];
    const relatedDocsJson: Array<Record<string, any>> = [];

    for (const relDoc of data.relatedDocuments) {
      const cfdi = relatedCfdis.find((c) => c.id === relDoc.cfdiId)!;
      const cfdiTotal = Number(cfdi.total);

      // Count existing payment complements for this CFDI to determine parcialidad
      const existingComplements = await this.prisma.cFDIPaymentComplement.findMany({
        where: {
          cfdi: { organizationId },
        },
      });

      // Filter complements that reference this CFDI in their relatedDocuments
      let totalPreviouslyPaid = 0;
      let parcialidadCount = 0;
      for (const comp of existingComplements) {
        const docs = comp.relatedDocuments as Array<Record<string, any>>;
        if (Array.isArray(docs)) {
          for (const doc of docs) {
            if (doc.cfdiId === cfdi.id) {
              totalPreviouslyPaid += Number(doc.amountPaid || 0);
              parcialidadCount++;
            }
          }
        }
      }

      const numParcialidad = parcialidadCount + 1;
      const saldoAnterior = Math.round((cfdiTotal - totalPreviouslyPaid) * 100) / 100;
      const impPagado = Math.round(relDoc.amountPaid * 100) / 100;
      const saldoInsoluto = Math.round((saldoAnterior - impPagado) * 100) / 100;

      if (impPagado > saldoAnterior) {
        throw new BadRequestException(
          `El pago ($${impPagado}) excede el saldo anterior ($${saldoAnterior}) de la factura ${cfdi.series || "A"}-${cfdi.folio || cfdi.id}`,
        );
      }

      if (saldoInsoluto < 0) {
        throw new BadRequestException(
          `El saldo insoluto no puede ser negativo para la factura ${cfdi.series || "A"}-${cfdi.folio || cfdi.id}`,
        );
      }

      // Calculate tax proportions for the payment amount
      // The tax base is proportional to the payment vs total
      const taxProportion = impPagado / cfdiTotal;
      const subtotalProportion = Number(cfdi.subtotal) * taxProportion;
      const discountProportion = Number(cfdi.discount) * taxProportion;
      const baseDR = Math.round((subtotalProportion - discountProportion) * 100) / 100;
      const ivaDR = Math.round(baseDR * 0.16 * 100) / 100;

      const docRelacionado: PaymentComplementDoctoRelacionado = {
        idDocumento: cfdi.uuid || cfdi.id,
        serie: cfdi.series || "A",
        folio: cfdi.folio || cfdi.id,
        monedaDR: cfdi.currency || "MXN",
        numParcialidad,
        impSaldoAnt: saldoAnterior,
        impPagado,
        impSaldoInsoluto,
        objetoImpDR: "02", // Objeto de impuesto
        impuestosDR: {
          trasladosDR: [
            {
              baseDR,
              impuestoDR: "002", // IVA
              tipoFactorDR: "Tasa",
              tasaOCuotaDR: 0.16,
              importeDR: ivaDR,
            },
          ],
        },
      };

      doctosRelacionados.push(docRelacionado);

      relatedDocsJson.push({
        cfdiId: cfdi.id,
        uuid: cfdi.uuid || cfdi.id,
        serie: cfdi.series || "A",
        folio: cfdi.folio || cfdi.id,
        amountPaid: impPagado,
        saldoAnterior,
        saldoInsoluto,
        numParcialidad,
      });
    }

    // Use the first related CFDI for emisor/receptor info
    const firstCfdi = relatedCfdis[0];

    // Generate the complement folio
    const existingPagoCount = await this.prisma.cFDI.count({
      where: { organizationId, cfdiType: "PAGO" },
    });
    const complementFolio = String(existingPagoCount + 1);

    // Build payment complement XML data
    const pago: PaymentComplementPago = {
      fechaPago: data.paymentDate.replace(/\.\d{3}Z$/, "").slice(0, 19),
      formaDePagoP: data.paymentForm,
      monedaP: currency,
      monto: roundedAmount,
      tipoCambioP: currency !== "MXN" ? 1 : undefined,
      doctosRelacionados,
    };

    const complementData: PaymentComplementData = {
      serie: "P",
      folio: complementFolio,
      fecha: new Date().toISOString().replace(/\.\d{3}Z$/, ""),
      lugarExpedicion: firstCfdi.branch?.postalCode || "00000",
      exportacion: "01",

      emisorRfc: firstCfdi.issuerRfc,
      emisorNombre: firstCfdi.issuerName,
      emisorRegimenFiscal: firstCfdi.issuerRegimen,

      receptorRfc: firstCfdi.receiverRfc,
      receptorNombre: firstCfdi.receiverName,
      receptorRegimenFiscal: firstCfdi.receiverRegimen || "616",
      receptorDomicilioFiscal: "00000",

      pagos: [pago],
    };

    const xml = buildPaymentComplementXml(complementData);

    // Create CFDI record (type PAGO) and CFDIPaymentComplement in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const cfdiRecord = await tx.cFDI.create({
        data: {
          organizationId,
          branchId: firstCfdi.branchId,
          cfdiType: "PAGO",
          series: "P",
          folio: complementFolio,
          issuerRfc: firstCfdi.issuerRfc,
          issuerName: firstCfdi.issuerName,
          issuerRegimen: firstCfdi.issuerRegimen,
          receiverRfc: firstCfdi.receiverRfc,
          receiverName: firstCfdi.receiverName,
          receiverRegimen: firstCfdi.receiverRegimen,
          receiverUsoCfdi: "CP01",
          subtotal: 0,
          discount: 0,
          total: 0,
          currency: "XXX", // Required by SAT for payment complement
          paymentMethod: undefined,
          paymentForm: undefined,
          xmlContent: xml,
          status: "STAMPED",
          stampedAt: new Date(),
          createdById: userId,
        },
      });

      const complement = await tx.cFDIPaymentComplement.create({
        data: {
          cfdiId: cfdiRecord.id,
          paymentDate: new Date(data.paymentDate),
          paymentForm: data.paymentForm,
          currency,
          amount: roundedAmount,
          relatedDocuments: relatedDocsJson,
        },
      });

      return {
        cfdi: cfdiRecord,
        complement,
        xml,
      };
    });

    await this.auditService.log({
      organizationId,
      userId,
      action: "CREATE",
      module: "FACTURACION",
      entityType: "CFDI",
      entityId: result.cfdi.id,
      description: `Complemento de Pago P-${complementFolio} creado - Monto: $${roundedAmount} - Docs: ${relatedDocsJson.map((d) => `${d.serie}-${d.folio}`).join(", ")}`,
    });

    return result;
  }

  /**
   * Lists all payment complements for the organization with related CFDI info.
   */
  async getPaymentComplements(organizationId: string, filters?: { status?: string }) {
    const where: any = {
      organizationId,
      cfdiType: "PAGO",
    };
    if (filters?.status) {
      where.status = filters.status;
    }

    const cfdis = await this.prisma.cFDI.findMany({
      where,
      include: {
        branch: true,
        paymentComplement: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return cfdis.map((cfdi) => ({
      id: cfdi.id,
      series: cfdi.series,
      folio: cfdi.folio,
      uuid: cfdi.uuid,
      status: cfdi.status,
      createdAt: cfdi.createdAt,
      stampedAt: cfdi.stampedAt,
      xmlContent: cfdi.xmlContent,
      receiverRfc: cfdi.receiverRfc,
      receiverName: cfdi.receiverName,
      complement: cfdi.paymentComplement
        ? {
            id: cfdi.paymentComplement.id,
            paymentDate: cfdi.paymentComplement.paymentDate,
            paymentForm: cfdi.paymentComplement.paymentForm,
            currency: cfdi.paymentComplement.currency,
            amount: cfdi.paymentComplement.amount,
            relatedDocuments: cfdi.paymentComplement.relatedDocuments,
          }
        : null,
    }));
  }

  /**
   * Lists CFDIs with PPD payment method that have an outstanding balance
   * (i.e., not fully paid via payment complements).
   */
  async getPendingPayments(organizationId: string) {
    // Get all STAMPED CFDIs with PPD payment method
    const ppdCfdis = await this.prisma.cFDI.findMany({
      where: {
        organizationId,
        paymentMethod: "PPD",
        status: "STAMPED",
      },
      include: {
        branch: true,
        concepts: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Get all existing payment complements for this organization
    const allComplements = await this.prisma.cFDIPaymentComplement.findMany({
      where: {
        cfdi: { organizationId },
      },
    });

    // Calculate paid amounts for each CFDI
    const paidMap = new Map<string, number>();
    for (const comp of allComplements) {
      const docs = comp.relatedDocuments as Array<Record<string, any>>;
      if (Array.isArray(docs)) {
        for (const doc of docs) {
          const cfdiId = doc.cfdiId as string;
          const paid = Number(doc.amountPaid || 0);
          paidMap.set(cfdiId, (paidMap.get(cfdiId) || 0) + paid);
        }
      }
    }

    // Build response with balance info
    return ppdCfdis
      .map((cfdi) => {
        const total = Number(cfdi.total);
        const totalPaid = paidMap.get(cfdi.id) || 0;
        const saldoPendiente = Math.round((total - totalPaid) * 100) / 100;

        return {
          id: cfdi.id,
          series: cfdi.series,
          folio: cfdi.folio,
          uuid: cfdi.uuid,
          receiverRfc: cfdi.receiverRfc,
          receiverName: cfdi.receiverName,
          total,
          totalPaid: Math.round(totalPaid * 100) / 100,
          saldoPendiente,
          currency: cfdi.currency,
          createdAt: cfdi.createdAt,
          branchName: cfdi.branch?.name,
        };
      })
      .filter((c) => c.saldoPendiente > 0); // Only return CFDIs with pending balance
  }

  // -------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------

  /**
   * Maps a Prisma CFDI record (with concepts) into the CfdiData
   * structure expected by the XML builder.
   */
  private buildCfdiDataFromInvoice(invoice: any): CfdiData {
    const subtotal = Number(invoice.subtotal);
    const discount = Number(invoice.discount) || 0;
    const total = Number(invoice.total);

    // Build concepto list with per-concept tax details
    const conceptos: CfdiConcepto[] = invoice.concepts.map((c: any) => {
      const amount = Number(c.amount);
      const conceptDiscount = Number(c.discount) || 0;
      const taxable = amount - conceptDiscount;
      const taxDetails = c.taxDetails || {};

      // Default: IVA 16% traslado, unless taxDetails specifies otherwise
      const ivaRate = taxDetails.ivaRate != null ? Number(taxDetails.ivaRate) : 0.16;
      const objetoImp = taxDetails.objetoImp || "02"; // "02" = Objeto de impuesto

      const hasIva = ivaRate > 0 && objetoImp !== "01";

      const impuestos = hasIva
        ? {
            traslados: [
              {
                base: taxable,
                impuesto: "002", // IVA
                tipoFactor: "Tasa",
                tasaOCuota: ivaRate,
                importe: Math.round(taxable * ivaRate * 100) / 100,
              },
            ],
          }
        : undefined;

      // Include retenciones if specified in taxDetails
      if (taxDetails.retenciones && impuestos) {
        impuestos["retenciones"] = taxDetails.retenciones.map((r: any) => ({
          base: taxable,
          impuesto: r.impuesto || "002",
          tipoFactor: r.tipoFactor || "Tasa",
          tasaOCuota: Number(r.tasaOCuota),
          importe: Math.round(taxable * Number(r.tasaOCuota) * 100) / 100,
        }));
      }

      return {
        claveProdServ: c.satClaveProdServ,
        cantidad: Number(c.quantity),
        claveUnidad: c.satClaveUnidad,
        unidad: c.unitOfMeasure,
        descripcion: c.description,
        valorUnitario: Number(c.unitPrice),
        importe: amount,
        descuento: conceptDiscount > 0 ? conceptDiscount : undefined,
        objetoImp,
        impuestos,
      };
    });

    // Calculate total taxes from conceptos
    let totalImpuestosTrasladados = 0;
    let totalImpuestosRetenidos = 0;

    for (const c of conceptos) {
      if (c.impuestos?.traslados) {
        for (const t of c.impuestos.traslados) {
          totalImpuestosTrasladados += t.importe;
        }
      }
      if (c.impuestos?.retenciones) {
        for (const r of c.impuestos.retenciones) {
          totalImpuestosRetenidos += r.importe;
        }
      }
    }

    totalImpuestosTrasladados = Math.round(totalImpuestosTrasladados * 100) / 100;
    totalImpuestosRetenidos = Math.round(totalImpuestosRetenidos * 100) / 100;

    return {
      serie: invoice.series || "A",
      folio: invoice.folio || invoice.id,
      fecha: new Date().toISOString().replace(/\.\d{3}Z$/, ""),
      formaPago: invoice.paymentForm || "99",
      metodoPago: invoice.paymentMethod || "PUE",
      tipoComprobante: CFDI_TYPE_MAP[invoice.cfdiType] || "I",
      moneda: invoice.currency || "MXN",
      tipoCambio: invoice.exchangeRate != null ? Number(invoice.exchangeRate) : undefined,
      lugarExpedicion: invoice.branch?.postalCode || "00000",
      exportacion: "01", // Default: no aplica exportacion

      emisorRfc: invoice.issuerRfc,
      emisorNombre: invoice.issuerName,
      emisorRegimenFiscal: invoice.issuerRegimen,

      receptorRfc: invoice.receiverRfc,
      receptorNombre: invoice.receiverName,
      receptorUsoCfdi: invoice.receiverUsoCfdi,
      receptorRegimenFiscal: invoice.receiverRegimen || "616",
      receptorDomicilioFiscal: "00000", // Should come from customer data

      conceptos,

      subtotal,
      descuento: discount > 0 ? discount : undefined,
      total,

      totalImpuestosTrasladados:
        totalImpuestosTrasladados > 0 ? totalImpuestosTrasladados : undefined,
      totalImpuestosRetenidos: totalImpuestosRetenidos > 0 ? totalImpuestosRetenidos : undefined,
    };
  }
}
