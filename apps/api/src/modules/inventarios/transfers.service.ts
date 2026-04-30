import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { Prisma, TransferStatus } from "@luka/database";
import { CreateTransferDto } from "./dto/create-transfer.dto";
import { ShipTransferDto } from "./dto/ship-transfer.dto";
import { ReceiveTransferDto } from "./dto/receive-transfer.dto";

const DECIMAL_EPSILON = 0.0001;
const SHIPPABLE_LOT_STATUSES = ["ACTIVE", "LOW"];

const TRANSFER_INCLUDE = {
  fromBranch: { select: { id: true, name: true, code: true } },
  toBranch: { select: { id: true, name: true, code: true } },
  items: {
    include: {
      product: {
        select: { id: true, name: true, sku: true, unitOfMeasure: true },
      },
      lotAllocations: true,
    },
  },
};

@Injectable()
export class TransfersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(
    organizationId: string,
    filters?: {
      status?: string;
      fromBranchId?: string;
      toBranchId?: string;
      dateFrom?: string;
      dateTo?: string;
    },
    page = 1,
    limit = 50,
  ) {
    const where: any = {
      fromBranch: { organizationId },
      toBranch: { organizationId },
    };

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.fromBranchId) {
      where.fromBranchId = filters.fromBranchId;
    }
    if (filters?.toBranchId) {
      where.toBranchId = filters.toBranchId;
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.interBranchTransfer.findMany({
        where,
        include: TRANSFER_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.interBranchTransfer.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findOne(organizationId: string, id: string) {
    const transfer = await this.prisma.interBranchTransfer.findFirst({
      where: {
        id,
        fromBranch: { organizationId },
        toBranch: { organizationId },
      },
      include: TRANSFER_INCLUDE,
    });
    if (!transfer) {
      throw new NotFoundException("Transferencia no encontrada");
    }
    return transfer;
  }

  async create(userId: string, organizationId: string, dto: CreateTransferDto) {
    if (dto.fromBranchId === dto.toBranchId) {
      throw new BadRequestException("La sucursal de origen y destino no pueden ser la misma");
    }

    // Validate both branches belong to the organization
    const [fromBranch, toBranch] = await Promise.all([
      this.prisma.branch.findFirst({
        where: { id: dto.fromBranchId, organizationId },
      }),
      this.prisma.branch.findFirst({
        where: { id: dto.toBranchId, organizationId },
      }),
    ]);

    if (!fromBranch) {
      throw new BadRequestException("Sucursal de origen no valida");
    }
    if (!toBranch) {
      throw new BadRequestException("Sucursal de destino no valida");
    }

    // Validate all products exist in the organization
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, organizationId },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException("Uno o mas productos no existen en la organizacion");
    }

    const transfer = await this.prisma.interBranchTransfer.create({
      data: {
        fromBranchId: dto.fromBranchId,
        toBranchId: dto.toBranchId,
        requestedById: userId,
        notes: dto.notes,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            requestedQuantity: item.requestedQuantity,
          })),
        },
      },
      include: TRANSFER_INCLUDE,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: "CREATE",
      module: "transferencias",
      entityType: "InterBranchTransfer",
      entityId: transfer.id,
      description: `Transferencia creada de ${fromBranch.name} a ${toBranch.name} con ${dto.items.length} producto(s)`,
    });

    return transfer;
  }

  async approve(id: string, userId: string, organizationId: string) {
    const transfer = await this.findOne(organizationId, id);
    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException("Solo se pueden aprobar transferencias pendientes");
    }

    const updated = await this.prisma.interBranchTransfer.update({
      where: { id },
      data: {
        status: TransferStatus.APPROVED,
        approvedById: userId,
      },
      include: TRANSFER_INCLUDE,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: "APPROVE",
      module: "transferencias",
      entityType: "InterBranchTransfer",
      entityId: id,
      description: `Transferencia aprobada de ${transfer.fromBranch.name} a ${transfer.toBranch.name}`,
    });

    return updated;
  }

  async ship(id: string, dto: ShipTransferDto, userId: string, organizationId: string) {
    const transfer = await this.findOne(organizationId, id);
    if (transfer.status !== TransferStatus.APPROVED) {
      throw new BadRequestException("Solo se pueden enviar transferencias aprobadas");
    }

    const shipmentItems = this.buildShipmentItems(transfer.items, dto.items);

    // Validate stock availability at origin branch
    for (const { transferItem, sentQuantity } of shipmentItems) {
      if (sentQuantity <= 0) {
        continue;
      }

      const inventory = await this.prisma.branchInventory.findUnique({
        where: {
          branchId_productId: {
            branchId: transfer.fromBranchId,
            productId: transferItem.productId,
          },
        },
      });

      const available = inventory ? Number(inventory.currentQuantity) : 0;
      if (available + DECIMAL_EPSILON < sentQuantity) {
        throw new BadRequestException(
          `Stock insuficiente para ${transferItem.product.name}. Disponible: ${available}, Solicitado: ${sentQuantity}`,
        );
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      for (const { transferItem, sentQuantity } of shipmentItems) {
        await tx.interBranchTransferItem.update({
          where: { id: transferItem.id },
          data: { sentQuantity },
        });
      }

      // Deduct from source branch inventory
      for (const { transferItem, sentQuantity } of shipmentItems) {
        if (sentQuantity <= 0) {
          continue;
        }

        await tx.branchInventory.update({
          where: {
            branchId_productId: {
              branchId: transfer.fromBranchId,
              productId: transferItem.productId,
            },
          },
          data: {
            currentQuantity: { decrement: sentQuantity },
          },
        });

        const requestedQuantity = this.toNumber(transferItem.requestedQuantity);
        await tx.inventoryMovement.create({
          data: {
            branchId: transfer.fromBranchId,
            productId: transferItem.productId,
            movementType: "TRANSFER_OUT",
            quantity: sentQuantity,
            referenceType: "inter_branch_transfer",
            referenceId: id,
            notes:
              sentQuantity + DECIMAL_EPSILON < requestedQuantity
                ? `Envio parcial: solicitado ${requestedQuantity}, enviado ${sentQuantity}`
                : undefined,
          },
        });

        await this.allocateShippedLots(
          tx,
          organizationId,
          transferItem.id,
          transfer.fromBranchId,
          transferItem.productId,
          sentQuantity,
        );
      }

      return tx.interBranchTransfer.update({
        where: { id },
        data: { status: TransferStatus.IN_TRANSIT },
        include: TRANSFER_INCLUDE,
      });
    });

    await this.audit.log({
      organizationId,
      userId,
      action: "SHIP",
      module: "transferencias",
      entityType: "InterBranchTransfer",
      entityId: id,
      description: `Transferencia enviada de ${transfer.fromBranch.name} a ${transfer.toBranch.name}`,
    });

    return result;
  }

  async receive(id: string, dto: ReceiveTransferDto, userId: string, organizationId: string) {
    const transfer = await this.findOne(organizationId, id);
    if (transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new BadRequestException("Solo se pueden recibir transferencias en transito");
    }

    const receiptItems = this.buildReceiptItems(transfer.items, dto.items);

    const result = await this.prisma.$transaction(async (tx) => {
      for (const { transferItem, receivedQuantity } of receiptItems) {
        await tx.interBranchTransferItem.update({
          where: { id: transferItem.id },
          data: { receivedQuantity },
        });
      }

      // Add to destination branch inventory
      for (const { transferItem, receivedQuantity } of receiptItems) {
        if (receivedQuantity <= 0) {
          continue;
        }

        await tx.branchInventory.upsert({
          where: {
            branchId_productId: {
              branchId: transfer.toBranchId,
              productId: transferItem.productId,
            },
          },
          update: {
            currentQuantity: { increment: receivedQuantity },
          },
          create: {
            branchId: transfer.toBranchId,
            productId: transferItem.productId,
            currentQuantity: receivedQuantity,
          },
        });

        const sentQuantity = this.toNumber(transferItem.sentQuantity);
        await tx.inventoryMovement.create({
          data: {
            branchId: transfer.toBranchId,
            productId: transferItem.productId,
            movementType: "TRANSFER_IN",
            quantity: receivedQuantity,
            referenceType: "inter_branch_transfer",
            referenceId: id,
            notes:
              receivedQuantity + DECIMAL_EPSILON < sentQuantity
                ? `Diferencia recepcion: enviado ${sentQuantity}, recibido ${receivedQuantity}`
                : undefined,
          },
        });

        await this.receiveAllocatedLots(
          tx,
          organizationId,
          userId,
          id,
          transfer.toBranchId,
          transferItem.id,
          transferItem.productId,
          receivedQuantity,
        );
      }

      const updatedTransfer = await tx.interBranchTransfer.update({
        where: { id },
        data: {
          status: TransferStatus.RECEIVED,
          completedAt: new Date(),
        },
        include: TRANSFER_INCLUDE,
      });

      await this.updateLinkedRequisitionStatus(tx, organizationId, id, receiptItems);

      return updatedTransfer;
    });

    await this.audit.log({
      organizationId,
      userId,
      action: "RECEIVE",
      module: "transferencias",
      entityType: "InterBranchTransfer",
      entityId: id,
      description: `Transferencia recibida en ${transfer.toBranch.name} desde ${transfer.fromBranch.name}`,
    });

    return result;
  }

  async cancel(id: string, userId: string, organizationId: string) {
    const transfer = await this.findOne(organizationId, id);

    if (
      transfer.status === TransferStatus.RECEIVED ||
      transfer.status === TransferStatus.CANCELLED
    ) {
      throw new BadRequestException(
        "No se puede cancelar una transferencia que ya fue recibida o cancelada",
      );
    }

    // If transfer was already shipped (IN_TRANSIT), reverse the inventory deductions
    if (transfer.status === TransferStatus.IN_TRANSIT) {
      await this.prisma.$transaction(async (tx) => {
        for (const item of transfer.items) {
          const sentQty = item.sentQuantity ? Number(item.sentQuantity) : 0;
          if (sentQty <= 0) continue;

          // Restore origin branch inventory
          await tx.branchInventory.update({
            where: {
              branchId_productId: {
                branchId: transfer.fromBranchId,
                productId: item.productId,
              },
            },
            data: {
              currentQuantity: { increment: sentQty },
            },
          });

          // Create reversal movement
          await tx.inventoryMovement.create({
            data: {
              branchId: transfer.fromBranchId,
              productId: item.productId,
              movementType: "TRANSFER_IN",
              quantity: sentQty,
              referenceType: "inter_branch_transfer_cancel",
              referenceId: id,
              notes: "Reverso por cancelacion de transferencia",
            },
          });

          await this.restoreCancelledLotAllocations(tx, item.id);
        }

        await tx.interBranchTransfer.update({
          where: { id },
          data: { status: TransferStatus.CANCELLED },
        });
      });
    } else {
      await this.prisma.interBranchTransfer.update({
        where: { id },
        data: { status: TransferStatus.CANCELLED },
      });
    }

    await this.audit.log({
      organizationId,
      userId,
      action: "CANCEL",
      module: "transferencias",
      entityType: "InterBranchTransfer",
      entityId: id,
      description: `Transferencia cancelada de ${transfer.fromBranch.name} a ${transfer.toBranch.name}`,
    });

    return this.findOne(organizationId, id);
  }

  private buildShipmentItems(
    transferItems: Array<{
      id: string;
      requestedQuantity: unknown;
      productId: string;
      product: { name: string };
    }>,
    dtoItems: Array<{ itemId: string; sentQuantity: number }>,
  ) {
    if (!dtoItems || dtoItems.length === 0) {
      throw new BadRequestException("Debe indicar al menos un producto enviado");
    }

    const itemMap = new Map(transferItems.map((item) => [item.id, item]));
    const sentMap = new Map<string, number>();

    for (const item of dtoItems) {
      if (sentMap.has(item.itemId)) {
        throw new BadRequestException(`Item duplicado en envio: ${item.itemId}`);
      }
      const transferItem = itemMap.get(item.itemId);
      if (!transferItem) {
        throw new BadRequestException(`Item de transferencia ${item.itemId} no encontrado`);
      }

      const sentQuantity = this.normalizeNonNegativeQuantity(item.sentQuantity, "enviada");
      const requestedQuantity = this.toNumber(transferItem.requestedQuantity);
      if (sentQuantity > requestedQuantity + DECIMAL_EPSILON) {
        throw new BadRequestException(
          `Cantidad enviada (${sentQuantity}) excede solicitada (${requestedQuantity}) para ${transferItem.product.name}`,
        );
      }
      sentMap.set(item.itemId, sentQuantity);
    }

    const result = transferItems.map((transferItem) => ({
      transferItem,
      sentQuantity: sentMap.get(transferItem.id) ?? 0,
    }));

    if (!result.some((item) => item.sentQuantity > 0)) {
      throw new BadRequestException("Debe enviar al menos una cantidad mayor a cero");
    }

    return result;
  }

  private buildReceiptItems(
    transferItems: Array<{
      id: string;
      requestedQuantity: unknown;
      sentQuantity: unknown;
      productId: string;
      product: { name: string };
    }>,
    dtoItems: Array<{ itemId: string; receivedQuantity: number }>,
  ) {
    if (!dtoItems || dtoItems.length === 0) {
      throw new BadRequestException("Debe indicar al menos un producto recibido");
    }

    const itemMap = new Map(transferItems.map((item) => [item.id, item]));
    const receivedMap = new Map<string, number>();

    for (const item of dtoItems) {
      if (receivedMap.has(item.itemId)) {
        throw new BadRequestException(`Item duplicado en recepcion: ${item.itemId}`);
      }
      const transferItem = itemMap.get(item.itemId);
      if (!transferItem) {
        throw new BadRequestException(`Item de transferencia ${item.itemId} no encontrado`);
      }
      const receivedQuantity = this.normalizeNonNegativeQuantity(item.receivedQuantity, "recibida");
      const sentQuantity = this.toNumber(transferItem.sentQuantity);
      if (receivedQuantity > sentQuantity + DECIMAL_EPSILON) {
        throw new BadRequestException(
          `Cantidad recibida (${receivedQuantity}) excede enviada (${sentQuantity}) para ${transferItem.product.name}`,
        );
      }
      receivedMap.set(item.itemId, receivedQuantity);
    }

    return transferItems.map((transferItem) => {
      const sentQuantity = this.toNumber(transferItem.sentQuantity);
      const receivedQuantity = receivedMap.get(transferItem.id);

      if (sentQuantity > 0 && receivedQuantity === undefined) {
        throw new BadRequestException(
          `Debe registrar la recepcion del item enviado ${transferItem.id}`,
        );
      }

      return {
        transferItem,
        receivedQuantity: receivedQuantity ?? 0,
      };
    });
  }

  private async updateLinkedRequisitionStatus(
    tx: any,
    organizationId: string,
    transferId: string,
    receiptItems: Array<{
      transferItem: { requestedQuantity: unknown };
      receivedQuantity: number;
    }>,
  ) {
    const requisition = await tx.requisition.findFirst({
      where: {
        organizationId,
        transferId,
        status: { in: ["APPROVED", "PARTIALLY_FULFILLED"] },
      },
      select: { id: true },
    });

    if (!requisition) {
      return;
    }

    const fullyReceived = receiptItems.every(
      ({ transferItem, receivedQuantity }) =>
        receivedQuantity + DECIMAL_EPSILON >= this.toNumber(transferItem.requestedQuantity),
    );
    const receivedAny = receiptItems.some(({ receivedQuantity }) => receivedQuantity > 0);
    const status = fullyReceived ? "FULFILLED" : receivedAny ? "PARTIALLY_FULFILLED" : "APPROVED";

    await tx.requisition.update({
      where: { id: requisition.id },
      data: { status },
    });
  }

  private async allocateShippedLots(
    tx: any,
    organizationId: string,
    transferItemId: string,
    branchId: string,
    productId: string,
    sentQuantity: number,
  ) {
    let remaining = this.roundQuantity(sentQuantity);
    if (remaining <= 0) {
      return;
    }

    const lots = await tx.productLot.findMany({
      where: {
        organizationId,
        branchId,
        productId,
        status: { in: SHIPPABLE_LOT_STATUSES },
        quantity: { gt: 0 },
      },
      orderBy: [{ expirationDate: "asc" }, { createdAt: "asc" }],
    });

    for (const lot of lots) {
      if (remaining <= DECIMAL_EPSILON) {
        break;
      }

      const available = this.toNumber(lot.quantity);
      if (available <= 0) {
        continue;
      }

      const allocatedQuantity = this.roundQuantity(Math.min(available, remaining));
      const nextQuantity = this.roundQuantity(Math.max(0, available - allocatedQuantity));

      await tx.productLot.update({
        where: { id: lot.id },
        data: {
          quantity: nextQuantity,
          status: this.getLotStatusAfterQuantity(lot.status, nextQuantity, lot.initialQuantity),
        },
      });

      await tx.interBranchTransferLotAllocation.create({
        data: {
          transferItemId,
          sourceLotId: lot.id,
          lotNumber: lot.lotNumber,
          expirationDate: lot.expirationDate,
          quantity: allocatedQuantity,
          unitCost: lot.unitCost ?? null,
        },
      });

      remaining = this.roundQuantity(remaining - allocatedQuantity);
    }
  }

  private async receiveAllocatedLots(
    tx: any,
    organizationId: string,
    userId: string,
    transferId: string,
    branchId: string,
    transferItemId: string,
    productId: string,
    receivedQuantity: number,
  ) {
    let remaining = this.roundQuantity(receivedQuantity);
    if (remaining <= 0) {
      return;
    }

    const allocations = await tx.interBranchTransferLotAllocation.findMany({
      where: { transferItemId },
      orderBy: [{ expirationDate: "asc" }, { createdAt: "asc" }],
    });

    for (const allocation of allocations) {
      if (remaining <= DECIMAL_EPSILON) {
        break;
      }

      const allocatedQuantity = this.toNumber(allocation.quantity);
      const alreadyReceived = this.toNumber(allocation.receivedQuantity);
      const receivableQuantity = this.roundQuantity(
        Math.max(0, allocatedQuantity - alreadyReceived),
      );
      if (receivableQuantity <= 0) {
        continue;
      }

      const lotReceiptQuantity = this.roundQuantity(Math.min(receivableQuantity, remaining));

      await tx.productLot.upsert({
        where: {
          branchId_productId_lotNumber: {
            branchId,
            productId,
            lotNumber: allocation.lotNumber,
          },
        },
        update: {
          quantity: { increment: lotReceiptQuantity },
          initialQuantity: { increment: lotReceiptQuantity },
          unitCost: allocation.unitCost ?? undefined,
          status: "ACTIVE",
        },
        create: {
          organizationId,
          branchId,
          productId,
          lotNumber: allocation.lotNumber,
          batchDate: new Date(),
          expirationDate: allocation.expirationDate,
          quantity: lotReceiptQuantity,
          initialQuantity: lotReceiptQuantity,
          unitCost: allocation.unitCost ?? null,
          receivedById: userId,
          status: "ACTIVE",
          notes: `Transferencia ${transferId}`,
        },
      });

      await tx.interBranchTransferLotAllocation.update({
        where: { id: allocation.id },
        data: { receivedQuantity: { increment: lotReceiptQuantity } },
      });

      remaining = this.roundQuantity(remaining - lotReceiptQuantity);
    }
  }

  private async restoreCancelledLotAllocations(tx: any, transferItemId: string) {
    const allocations = await tx.interBranchTransferLotAllocation.findMany({
      where: { transferItemId },
      include: { sourceLot: true },
    });

    for (const allocation of allocations) {
      const restoreQuantity = this.roundQuantity(
        this.toNumber(allocation.quantity) - this.toNumber(allocation.receivedQuantity),
      );
      if (restoreQuantity <= 0 || !allocation.sourceLot) {
        continue;
      }

      const nextQuantity = this.roundQuantity(
        this.toNumber(allocation.sourceLot.quantity) + restoreQuantity,
      );

      await tx.productLot.update({
        where: { id: allocation.sourceLot.id },
        data: {
          quantity: { increment: restoreQuantity },
          status: this.getLotStatusAfterQuantity(
            allocation.sourceLot.status,
            nextQuantity,
            allocation.sourceLot.initialQuantity,
          ),
        },
      });
    }
  }

  private getLotStatusAfterQuantity(
    currentStatus: string,
    quantity: number,
    initialQuantity: unknown,
  ): string {
    if (quantity <= DECIMAL_EPSILON) {
      return "CONSUMED";
    }
    if (
      ["ACTIVE", "LOW"].includes(currentStatus) &&
      quantity <= this.toNumber(initialQuantity) * 0.1
    ) {
      return "LOW";
    }
    return currentStatus === "CONSUMED" ? "ACTIVE" : currentStatus;
  }

  private normalizeNonNegativeQuantity(quantity: number, label: string): number {
    const normalized = this.roundQuantity(Number(quantity));
    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new BadRequestException(`La cantidad ${label} no puede ser negativa`);
    }
    return normalized;
  }

  private roundQuantity(quantity: number): number {
    return Math.round(quantity * 10000) / 10000;
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (value instanceof Prisma.Decimal) return value.toNumber();
    return Number(value);
  }
}
