import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { TransferStatus } from "@luka/database";
import { CreateTransferDto } from "./dto/create-transfer.dto";
import { ShipTransferDto } from "./dto/ship-transfer.dto";
import { ReceiveTransferDto } from "./dto/receive-transfer.dto";

const TRANSFER_INCLUDE = {
  fromBranch: { select: { id: true, name: true, code: true } },
  toBranch: { select: { id: true, name: true, code: true } },
  items: {
    include: {
      product: {
        select: { id: true, name: true, sku: true, unitOfMeasure: true },
      },
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

  async findOne(id: string) {
    const transfer = await this.prisma.interBranchTransfer.findUnique({
      where: { id },
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
    const transfer = await this.findOne(id);
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
    const transfer = await this.findOne(id);
    if (transfer.status !== TransferStatus.APPROVED) {
      throw new BadRequestException("Solo se pueden enviar transferencias aprobadas");
    }

    // Validate stock availability at origin branch
    for (const item of dto.items) {
      const transferItem = transfer.items.find((ti) => ti.id === item.itemId);
      if (!transferItem) {
        throw new BadRequestException(`Item de transferencia ${item.itemId} no encontrado`);
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
      if (available < item.sentQuantity) {
        throw new BadRequestException(
          `Stock insuficiente para ${transferItem.product.name}. Disponible: ${available}, Solicitado: ${item.sentQuantity}`,
        );
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        await tx.interBranchTransferItem.update({
          where: { id: item.itemId },
          data: { sentQuantity: item.sentQuantity },
        });
      }

      // Deduct from source branch inventory
      for (const transferItem of transfer.items) {
        const sentItem = dto.items.find((i) => i.itemId === transferItem.id);
        if (!sentItem) continue;

        await tx.branchInventory.update({
          where: {
            branchId_productId: {
              branchId: transfer.fromBranchId,
              productId: transferItem.productId,
            },
          },
          data: {
            currentQuantity: { decrement: sentItem.sentQuantity },
          },
        });

        await tx.inventoryMovement.create({
          data: {
            branchId: transfer.fromBranchId,
            productId: transferItem.productId,
            movementType: "TRANSFER_OUT",
            quantity: sentItem.sentQuantity,
            referenceType: "inter_branch_transfer",
            referenceId: id,
          },
        });
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
    const transfer = await this.findOne(id);
    if (transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new BadRequestException("Solo se pueden recibir transferencias en transito");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        await tx.interBranchTransferItem.update({
          where: { id: item.itemId },
          data: { receivedQuantity: item.receivedQuantity },
        });
      }

      // Add to destination branch inventory
      for (const transferItem of transfer.items) {
        const recvItem = dto.items.find((i) => i.itemId === transferItem.id);
        if (!recvItem) continue;

        await tx.branchInventory.upsert({
          where: {
            branchId_productId: {
              branchId: transfer.toBranchId,
              productId: transferItem.productId,
            },
          },
          update: {
            currentQuantity: { increment: recvItem.receivedQuantity },
          },
          create: {
            branchId: transfer.toBranchId,
            productId: transferItem.productId,
            currentQuantity: recvItem.receivedQuantity,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            branchId: transfer.toBranchId,
            productId: transferItem.productId,
            movementType: "TRANSFER_IN",
            quantity: recvItem.receivedQuantity,
            referenceType: "inter_branch_transfer",
            referenceId: id,
          },
        });
      }

      return tx.interBranchTransfer.update({
        where: { id },
        data: {
          status: TransferStatus.RECEIVED,
          completedAt: new Date(),
        },
        include: TRANSFER_INCLUDE,
      });
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
    const transfer = await this.findOne(id);

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

    return this.findOne(id);
  }
}
