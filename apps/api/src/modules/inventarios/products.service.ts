import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CacheService } from "../../common/cache/cache.service";
import { JwtPayload } from "../../common/decorators/current-user.decorator";
import { AuditService } from "../audit/audit.service";

const PRODUCTS_TTL = 600; // 10 minutes

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private auditService: AuditService,
  ) {}

  async findAll(
    organizationId: string,
    filters?: {
      search?: string;
      categoryId?: string;
      includeInactive?: boolean;
      page?: number;
      limit?: number;
    },
  ) {
    // Use cache only for unfiltered requests (default listing)
    const isUnfiltered =
      !filters?.search && !filters?.categoryId && !filters?.includeInactive && !filters?.page;
    const cacheKey = `products:${organizationId}`;

    if (isUnfiltered) {
      const cached = await this.cache.get<any[]>(cacheKey);
      if (cached) return cached;
    }

    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 100, 500);
    const where: any = {
      organizationId,
      ...(!filters?.includeInactive && { isActive: true }),
    };

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { sku: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    if (filters?.categoryId) {
      where.categoryId = filters.categoryId;
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: true,
        presentations: {
          where: { isActive: true },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    if (isUnfiltered) {
      await this.cache.set(cacheKey, products, PRODUCTS_TTL);
    }

    return products;
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

    await this.cache.del(`products:${organizationId}`);

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

    await this.cache.del(`products:${organizationId}`);

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

    await this.cache.del(`products:${organizationId}`);

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
