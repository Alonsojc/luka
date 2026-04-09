import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PurchaseOrderStatus } from "@luka/database";

@Injectable()
export class PurchaseOrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { organizationId },
      include: {
        supplier: true,
        branch: true,
        items: { include: { product: true } },
      },
      orderBy: { createdAt: "desc" },
    });
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

    const subtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
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

        const subtotal = items.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice,
          0,
        );
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

    return this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const poItem = po.items.find((i) => i.id === item.itemId);
        if (!poItem) continue;

        await tx.purchaseOrderItem.update({
          where: { id: item.itemId },
          data: {
            receivedQuantity: {
              increment: item.receivedQuantity,
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
            currentQuantity: { increment: item.receivedQuantity },
          },
          create: {
            branchId: po.branchId,
            productId: poItem.productId,
            currentQuantity: item.receivedQuantity,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            branchId: po.branchId,
            productId: poItem.productId,
            movementType: "IN",
            quantity: item.receivedQuantity,
            unitCost: poItem.unitPrice,
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
}
