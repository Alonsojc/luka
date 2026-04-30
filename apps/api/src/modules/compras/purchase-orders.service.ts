import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PurchaseOrderStatus } from "@luka/database";

const DECIMAL_EPSILON = 0.0001;

@Injectable()
export class PurchaseOrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    filters?: {
      status?: string;
      branchId?: string;
      supplierId?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 50, 200);
    const where: any = { organizationId };

    if (filters?.status) where.status = filters.status;
    if (filters?.branchId) where.branchId = filters.branchId;
    if (filters?.supplierId) where.supplierId = filters.supplierId;

    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: true,
          branch: true,
          items: { include: { product: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findOne(organizationId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      include: {
        supplier: true,
        branch: true,
        items: { include: { product: true } },
      },
    });
    if (!po) {
      throw new NotFoundException("Orden de compra no encontrada");
    }
    return po;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      branchId: string;
      supplierId: string;
      currency?: string;
      notes?: string;
      items: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
        unitOfMeasure: string;
      }>;
    },
  ) {
    const { items, ...poData } = data;

    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const tax = subtotal * 0.16; // IVA 16%
    const total = subtotal + tax;

    return this.prisma.purchaseOrder.create({
      data: {
        organizationId,
        createdById: userId,
        ...poData,
        subtotal,
        tax,
        total,
        items: {
          create: items,
        },
      },
      include: {
        supplier: true,
        branch: true,
        items: { include: { product: true } },
      },
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: {
      branchId?: string;
      supplierId?: string;
      notes?: string;
      items?: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
        unitOfMeasure: string;
      }>;
    },
  ) {
    const po = await this.findOne(organizationId, id);
    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException("Solo se pueden editar órdenes en borrador");
    }

    const { items, ...poData } = data;

    return this.prisma.$transaction(async (tx) => {
      if (items) {
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: id },
        });
        await tx.purchaseOrderItem.createMany({
          data: items.map((item) => ({ purchaseOrderId: id, ...item })),
        });

        const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
        const tax = subtotal * 0.16;
        const total = subtotal + tax;

        return tx.purchaseOrder.update({
          where: { id },
          data: { ...poData, subtotal, tax, total },
          include: {
            supplier: true,
            branch: true,
            items: { include: { product: true } },
          },
        });
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: poData,
        include: {
          supplier: true,
          branch: true,
          items: { include: { product: true } },
        },
      });
    });
  }

  async send(organizationId: string, id: string) {
    const po = await this.findOne(organizationId, id);
    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException("Solo se pueden enviar órdenes en borrador");
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.SENT },
      include: {
        supplier: true,
        branch: true,
        items: { include: { product: true } },
      },
    });
  }

  async receive(
    organizationId: string,
    id: string,
    userId: string,
    items: Array<{ itemId: string; receivedQuantity: number }>,
  ) {
    const po = await this.findOne(organizationId, id);
    if (
      po.status !== PurchaseOrderStatus.SENT &&
      po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
    ) {
      throw new BadRequestException(
        "Solo se pueden recibir órdenes enviadas o parcialmente recibidas",
      );
    }

    const receiptItems = this.validateReceiptItems(po.items, items);

    return this.prisma.$transaction(async (tx) => {
      for (const { poItem, receivedQuantity } of receiptItems) {
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: {
            receivedQuantity: {
              increment: receivedQuantity,
            },
          },
        });

        // Update branch inventory
        await tx.branchInventory.upsert({
          where: {
            branchId_productId: {
              branchId: po.branchId,
              productId: poItem.productId,
            },
          },
          update: {
            currentQuantity: { increment: receivedQuantity },
          },
          create: {
            branchId: po.branchId,
            productId: poItem.productId,
            currentQuantity: receivedQuantity,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            branchId: po.branchId,
            productId: poItem.productId,
            movementType: "IN",
            quantity: receivedQuantity,
            unitCost: this.toNumber(poItem.unitPrice),
            referenceType: "purchase_order",
            referenceId: id,
            userId,
          },
        });
      }

      // Check if fully received
      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id },
      });
      const fullyReceived = updatedItems.every(
        (i) => Number(i.receivedQuantity) >= Number(i.quantity),
      );

      const newStatus = fullyReceived
        ? PurchaseOrderStatus.RECEIVED
        : PurchaseOrderStatus.PARTIALLY_RECEIVED;

      return tx.purchaseOrder.update({
        where: { id },
        data: { status: newStatus, approvedById: userId },
        include: {
          supplier: true,
          branch: true,
          items: { include: { product: true } },
        },
      });
    });
  }

  async remove(organizationId: string, id: string) {
    const po = await this.findOne(organizationId, id);
    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException("Solo se pueden cancelar órdenes en borrador");
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CANCELLED },
    });
  }

  private validateReceiptItems(
    poItems: Array<{
      id: string;
      quantity: unknown;
      receivedQuantity: unknown;
      productId: string;
      unitPrice: unknown;
    }>,
    items: Array<{ itemId: string; receivedQuantity: number }>,
  ) {
    if (!items || items.length === 0) {
      throw new BadRequestException("Debe indicar al menos un producto recibido");
    }

    const poItemMap = new Map(poItems.map((item) => [item.id, item]));
    const seen = new Set<string>();

    return items.map((item) => {
      if (seen.has(item.itemId)) {
        throw new BadRequestException(`Item duplicado en recepción: ${item.itemId}`);
      }
      seen.add(item.itemId);

      const poItem = poItemMap.get(item.itemId);
      if (!poItem) {
        throw new BadRequestException(`Item de orden de compra ${item.itemId} no encontrado`);
      }

      const receivedQuantity = this.normalizePositiveQuantity(item.receivedQuantity);
      const orderedQuantity = this.toNumber(poItem.quantity);
      const alreadyReceived = this.toNumber(poItem.receivedQuantity);
      const remainingQuantity = this.roundQuantity(orderedQuantity - alreadyReceived);

      if (receivedQuantity > remainingQuantity + DECIMAL_EPSILON) {
        throw new BadRequestException(
          `Cantidad recibida (${receivedQuantity}) excede pendiente (${remainingQuantity}) para el item ${item.itemId}`,
        );
      }

      return { poItem, receivedQuantity };
    });
  }

  private normalizePositiveQuantity(quantity: number): number {
    const normalized = this.roundQuantity(Number(quantity));
    if (!Number.isFinite(normalized) || normalized <= 0) {
      throw new BadRequestException("La cantidad recibida debe ser mayor a cero");
    }
    return normalized;
  }

  private roundQuantity(quantity: number): number {
    return Math.round(quantity * 10000) / 10000;
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }
}
