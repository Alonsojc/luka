import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { JwtPayload } from "../../common/decorators/current-user.decorator";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async findAll(organizationId: string) {
    return this.prisma.product.findMany({
      where: { organizationId },
      include: {
        category: true,
        presentations: {
          where: { isActive: true },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
      include: {
        category: true,
        presentations: {
          where: { isActive: true },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        },
      },
    });
    if (!product) {
      throw new NotFoundException("Producto no encontrado");
    }
    return product;
  }

  async create(
    organizationId: string,
    data: {
      sku: string;
      name: string;
      description?: string;
      categoryId?: string;
      unitOfMeasure: string;
      costPerUnit: number;
      satClaveProdServ?: string;
      satClaveUnidad?: string;
      imageUrl?: string;
    },
    caller?: JwtPayload,
  ) {
    const created = await this.prisma.product.create({
      data: {
        organizationId,
        ...data,
      },
      include: {
        category: true,
        presentations: {
          where: { isActive: true },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        },
      },
    });

    if (caller) {
      await this.auditService.log({
        organizationId,
        userId: caller.sub,
        userName: caller.email,
        action: "CREATE",
        module: "INVENTARIOS",
        entityType: "Product",
        entityId: created.id,
        description: `Producto creado: ${data.name} (SKU: ${data.sku})`,
      });
    }

    return created;
  }

  async update(
    organizationId: string,
    id: string,
    data: {
      sku?: string;
      name?: string;
      description?: string;
      categoryId?: string;
      unitOfMeasure?: string;
      costPerUnit?: number;
      satClaveProdServ?: string;
      satClaveUnidad?: string;
      imageUrl?: string;
      isActive?: boolean;
    },
    caller?: JwtPayload,
  ) {
    const existing = await this.findOne(organizationId, id);
    const updated = await this.prisma.product.update({
      where: { id },
      data,
      include: {
        category: true,
        presentations: {
          where: { isActive: true },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        },
      },
    });

    if (caller) {
      const changes: Record<string, { old: any; new: any }> = {};
      for (const key of Object.keys(data) as Array<keyof typeof data>) {
        if (data[key] !== undefined && (existing as any)[key] !== data[key]) {
          changes[key] = { old: (existing as any)[key], new: data[key] };
        }
      }
      await this.auditService.log({
        organizationId,
        userId: caller.sub,
        userName: caller.email,
        action: "UPDATE",
        module: "INVENTARIOS",
        entityType: "Product",
        entityId: id,
        description: `Producto actualizado: ${existing.name}`,
        changes: Object.keys(changes).length > 0 ? changes : undefined,
      });
    }

    return updated;
  }

  async remove(organizationId: string, id: string, caller?: JwtPayload) {
    const existing = await this.findOne(organizationId, id);
    const result = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

    if (caller) {
      await this.auditService.log({
        organizationId,
        userId: caller.sub,
        userName: caller.email,
        action: "DELETE",
        module: "INVENTARIOS",
        entityType: "Product",
        entityId: id,
        description: `Producto desactivado: ${existing.name} (SKU: ${existing.sku})`,
      });
    }

    return result;
  }
}
