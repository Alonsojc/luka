import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class CfdiService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.cFDI.findMany({
      where: { organizationId },
      include: {
        branch: true,
        concepts: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const cfdi = await this.prisma.cFDI.findFirst({
      where: { id, organizationId },
      include: {
        branch: true,
        concepts: true,
        relatedCfdis: true,
        paymentComplement: true,
      },
    });
    if (!cfdi) {
      throw new NotFoundException("CFDI no encontrado");
    }
    return cfdi;
  }

  async create(
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

    // Calculate totals from concepts
    const subtotal = concepts.reduce((sum, c) => sum + c.quantity * c.unitPrice, 0);
    const totalDiscount = concepts.reduce((sum, c) => sum + (c.discount || 0), 0);

    // Calculate amounts for concepts
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

    return this.prisma.cFDI.create({
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
  }

  async update(
    organizationId: string,
    id: string,
    data: {
      receiverRfc?: string;
      receiverName?: string;
      receiverRegimen?: string;
      receiverUsoCfdi?: string;
      paymentMethod?: string;
      paymentForm?: string;
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
    const cfdi = await this.findOne(organizationId, id);
    if (cfdi.status !== "DRAFT") {
      throw new BadRequestException("Solo se pueden editar CFDI en borrador");
    }

    const { concepts, ...cfdiData } = data;

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
            ...cfdiData,
            subtotal: Math.round(subtotal * 100) / 100,
            discount: Math.round(totalDiscount * 100) / 100,
            total,
          },
          include: { branch: true, concepts: true },
        });
      }

      return tx.cFDI.update({
        where: { id },
        data: cfdiData,
        include: { branch: true, concepts: true },
      });
    });
  }

  async cancel(organizationId: string, id: string, reason: string) {
    const cfdi = await this.findOne(organizationId, id);
    if (cfdi.status === "CANCELLED") {
      throw new BadRequestException("El CFDI ya está cancelado");
    }
    return this.prisma.cFDI.update({
      where: { id },
      data: {
        status: cfdi.status === "STAMPED" ? "CANCELLATION_PENDING" : "CANCELLED",
        cancellationReason: reason,
        cancelledAt: new Date(),
      },
    });
  }

  async remove(organizationId: string, id: string) {
    const cfdi = await this.findOne(organizationId, id);
    if (cfdi.status !== "DRAFT") {
      throw new BadRequestException("Solo se pueden eliminar CFDI en borrador");
    }
    return this.prisma.cFDI.delete({ where: { id } });
  }
}
