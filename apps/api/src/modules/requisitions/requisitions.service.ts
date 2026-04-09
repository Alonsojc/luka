import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  CreateRequisitionDto,
  UpdateRequisitionDto,
} from "./dto/create-requisition.dto";
import {
  ApproveRequisitionDto,
  RejectRequisitionDto,
} from "./dto/approve-requisition.dto";

const REQUISITION_INCLUDE = {
  requestingBranch: { select: { id: true, name: true, code: true } },
  fulfillingBranch: { select: { id: true, name: true, code: true } },
  requestedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  approvedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          unitOfMeasure: true,
          costPerUnit: true,
        },
      },
    },
  },
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED"],
  PARTIALLY_FULFILLED: ["FULFILLED"],
  FULFILLED: [],
  REJECTED: [],
  CANCELLED: [],
};

@Injectable()
export class RequisitionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(
    organizationId: string,
    filters?: {
      status?: string;
      requestingBranchId?: string;
      fulfillingBranchId?: string;
      priority?: string;
      dateFrom?: string;
      dateTo?: string;
    },
    page = 1,
    limit = 50,
  ) {
    const where: any = { organizationId };

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.requestingBranchId) {
      where.requestingBranchId = filters.requestingBranchId;
    }
    if (filters?.fulfillingBranchId) {
      where.fulfillingBranchId = filters.fulfillingBranchId;
    }
    if (filters?.priority) {
      where.priority = filters.priority;
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.requisition.findMany({
        where,
        include: REQUISITION_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.requisition.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, organizationId: string) {
    const requisition = await this.prisma.requisition.findFirst({
      where: { id, organizationId },
      include: REQUISITION_INCLUDE,
    });
    if (!requisition) {
      throw new NotFoundException("Requisicion no encontrada");
    }
    return requisition;
  }

  async create(
    userId: string,
    organizationId: string,
    dto: CreateRequisitionDto,
  ) {
    // Validate requesting branch belongs to the organization
    const requestingBranch = await this.prisma.branch.findFirst({
      where: { id: dto.requestingBranchId, organizationId },
    });
    if (!requestingBranch) {
      throw new BadRequestException("Sucursal solicitante no valida");
    }

    // If fulfilling branch is specified, validate it
    if (dto.fulfillingBranchId) {
      const fulfillingBranch = await this.prisma.branch.findFirst({
        where: { id: dto.fulfillingBranchId, organizationId },
      });
      if (!fulfillingBranch) {
        throw new BadRequestException("Sucursal de surtido no valida");
      }
    }

    // Auto-assign fulfilling branch to the first CEDIS if not specified
    let fulfillingBranchId = dto.fulfillingBranchId;
    if (!fulfillingBranchId) {
      const cedis = await this.prisma.branch.findFirst({
        where: { organizationId, branchType: "CEDIS", isActive: true },
      });
      if (cedis) {
        fulfillingBranchId = cedis.id;
      }
    }

    // Validate all products exist in the organization
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, organizationId },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException(
        "Uno o mas productos no existen en la organizacion",
      );
    }

    const status = dto.status || "DRAFT";

    const requisition = await this.prisma.requisition.create({
      data: {
        organizationId,
        requestingBranchId: dto.requestingBranchId,
        fulfillingBranchId: fulfillingBranchId || null,
        status,
        priority: dto.priority || "NORMAL",
        requestedDeliveryDate: dto.requestedDeliveryDate
          ? new Date(dto.requestedDeliveryDate)
          : null,
        notes: dto.notes,
        requestedById: userId,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            requestedQuantity: item.requestedQuantity,
            unitOfMeasure: item.unitOfMeasure,
            notes: item.notes,
          })),
        },
      },
      include: REQUISITION_INCLUDE,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: "CREATE",
      module: "requisiciones",
      entityType: "Requisition",
      entityId: requisition.id,
      description: `Requisicion creada por ${requestingBranch.name} con ${dto.items.length} producto(s) - Estado: ${status}`,
    });

    return requisition;
  }

  async update(
    id: string,
    userId: string,
    organizationId: string,
    dto: UpdateRequisitionDto,
  ) {
    const requisition = await this.findOne(id, organizationId);

    if (requisition.status !== "DRAFT") {
      throw new BadRequestException(
        "Solo se pueden editar requisiciones en borrador",
      );
    }

    // If items are provided, replace all items
    const updateData: any = {};
    if (dto.priority) updateData.priority = dto.priority;
    if (dto.requestedDeliveryDate !== undefined) {
      updateData.requestedDeliveryDate = dto.requestedDeliveryDate
        ? new Date(dto.requestedDeliveryDate)
        : null;
    }
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    if (dto.items) {
      // Validate products
      const productIds = dto.items.map((i) => i.productId);
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds }, organizationId },
      });
      if (products.length !== productIds.length) {
        throw new BadRequestException(
          "Uno o mas productos no existen en la organizacion",
        );
      }

      // Delete existing items and create new ones
      await this.prisma.requisitionItem.deleteMany({
        where: { requisitionId: id },
      });

      updateData.items = {
        create: dto.items.map((item) => ({
          productId: item.productId,
          requestedQuantity: item.requestedQuantity,
          unitOfMeasure: item.unitOfMeasure,
          notes: item.notes,
        })),
      };
    }

    const updated = await this.prisma.requisition.update({
      where: { id },
      data: updateData,
      include: REQUISITION_INCLUDE,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: "UPDATE",
      module: "requisiciones",
      entityType: "Requisition",
      entityId: id,
      description: `Requisicion actualizada`,
    });

    return updated;
  }

  async submit(id: string, userId: string, organizationId: string) {
    const requisition = await this.findOne(id, organizationId);
    this.validateTransition(requisition.status, "SUBMITTED");

    const updated = await this.prisma.requisition.update({
      where: { id },
      data: { status: "SUBMITTED" },
      include: REQUISITION_INCLUDE,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: "SUBMIT",
      module: "requisiciones",
      entityType: "Requisition",
      entityId: id,
      description: `Requisicion enviada para aprobacion por ${requisition.requestingBranch.name}`,
    });

    return updated;
  }

  async approve(
    id: string,
    userId: string,
    organizationId: string,
    dto: ApproveRequisitionDto,
  ) {
    const requisition = await this.findOne(id, organizationId);
    this.validateTransition(requisition.status, "APPROVED");

    // Update approved quantities if provided
    if (dto.items && dto.items.length > 0) {
      for (const item of dto.items) {
        await this.prisma.requisitionItem.update({
          where: { id: item.itemId },
          data: { approvedQuantity: item.approvedQuantity },
        });
      }
    } else {
      // Auto-approve all items with requested quantities
      await this.prisma.requisitionItem.updateMany({
        where: { requisitionId: id },
        data: { approvedQuantity: undefined },
      });
      // Set each item's approved = requested
      for (const item of requisition.items) {
        await this.prisma.requisitionItem.update({
          where: { id: item.id },
          data: { approvedQuantity: item.requestedQuantity },
        });
      }
    }

    const updateData: any = {
      status: "APPROVED",
      approvedById: userId,
    };
    if (dto.fulfillingBranchId) {
      updateData.fulfillingBranchId = dto.fulfillingBranchId;
    }

    const updated = await this.prisma.requisition.update({
      where: { id },
      data: updateData,
      include: REQUISITION_INCLUDE,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: "APPROVE",
      module: "requisiciones",
      entityType: "Requisition",
      entityId: id,
      description: `Requisicion aprobada para ${requisition.requestingBranch.name}`,
    });

    return updated;
  }

  async reject(
    id: string,
    userId: string,
    organizationId: string,
    dto: RejectRequisitionDto,
  ) {
    const requisition = await this.findOne(id, organizationId);
    this.validateTransition(requisition.status, "REJECTED");

    const updated = await this.prisma.requisition.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectionReason: dto.rejectionReason,
        approvedById: userId,
      },
      include: REQUISITION_INCLUDE,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: "REJECT",
      module: "requisiciones",
      entityType: "Requisition",
      entityId: id,
      description: `Requisicion rechazada para ${requisition.requestingBranch.name}: ${dto.rejectionReason}`,
    });

    return updated;
  }

  async fulfill(id: string, userId: string, organizationId: string) {
    const requisition = await this.findOne(id, organizationId);
    this.validateTransition(requisition.status, "FULFILLED");

    if (!requisition.fulfillingBranchId) {
      throw new BadRequestException(
        "No se ha asignado una sucursal de surtido",
      );
    }

    // Create an InterBranchTransfer from the requisition
    const transfer = await this.prisma.interBranchTransfer.create({
      data: {
        fromBranchId: requisition.fulfillingBranchId,
        toBranchId: requisition.requestingBranchId,
        requestedById: userId,
        notes: `Generado automaticamente desde requisicion ${requisition.id}`,
        items: {
          create: requisition.items.map((item) => ({
            productId: item.productId,
            requestedQuantity: item.approvedQuantity ?? item.requestedQuantity,
          })),
        },
      },
    });

    // Link the transfer to the requisition and mark as fulfilled
    const updated = await this.prisma.requisition.update({
      where: { id },
      data: {
        status: "FULFILLED",
        transferId: transfer.id,
      },
      include: REQUISITION_INCLUDE,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: "FULFILL",
      module: "requisiciones",
      entityType: "Requisition",
      entityId: id,
      description: `Requisicion surtida - Transferencia ${transfer.id} creada de ${requisition.fulfillingBranch?.name || "CEDIS"} a ${requisition.requestingBranch.name}`,
    });

    return { ...updated, transfer };
  }

  async cancel(id: string, userId: string, organizationId: string) {
    const requisition = await this.findOne(id, organizationId);
    this.validateTransition(requisition.status, "CANCELLED");

    const updated = await this.prisma.requisition.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: REQUISITION_INCLUDE,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: "CANCEL",
      module: "requisiciones",
      entityType: "Requisition",
      entityId: id,
      description: `Requisicion cancelada por ${requisition.requestingBranch.name}`,
    });

    return updated;
  }

  async getSummary(organizationId: string, branchId?: string) {
    const baseWhere: any = { organizationId };
    if (branchId) {
      baseWhere.OR = [
        { requestingBranchId: branchId },
        { fulfillingBranchId: branchId },
      ];
    }

    const statuses = [
      "DRAFT",
      "SUBMITTED",
      "APPROVED",
      "PARTIALLY_FULFILLED",
      "FULFILLED",
      "REJECTED",
      "CANCELLED",
    ];

    const counts: Record<string, number> = {};
    for (const status of statuses) {
      counts[status] = await this.prisma.requisition.count({
        where: { ...baseWhere, status },
      });
    }

    // Pending for approval (SUBMITTED)
    const pendingApproval = counts["SUBMITTED"];

    // Today's counts
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayWhere = {
      ...baseWhere,
      updatedAt: { gte: today, lt: tomorrow },
    };

    const [approvedToday, rejectedToday, fulfilledToday] = await Promise.all([
      this.prisma.requisition.count({
        where: { ...todayWhere, status: "APPROVED" },
      }),
      this.prisma.requisition.count({
        where: { ...todayWhere, status: "REJECTED" },
      }),
      this.prisma.requisition.count({
        where: { ...todayWhere, status: "FULFILLED" },
      }),
    ]);

    return {
      counts,
      pendingApproval,
      approvedToday,
      rejectedToday,
      fulfilledToday,
    };
  }

  private validateTransition(currentStatus: string, newStatus: string) {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new BadRequestException(
        `No se puede cambiar el estado de ${currentStatus} a ${newStatus}`,
      );
    }
  }
}
