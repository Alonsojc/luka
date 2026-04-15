import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { JwtPayload } from "../../common/decorators/current-user.decorator";
import { AuditService } from "../audit/audit.service";
import { CreatePresentationDto } from "./dto/create-presentation.dto";
import { UpdatePresentationDto } from "./dto/update-presentation.dto";

@Injectable()
export class PresentationsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Verify that a product belongs to the caller's organization.
   * Returns the product if found, otherwise throws.
   */
  private async verifyProduct(organizationId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) {
      throw new NotFoundException("Producto no encontrado");
    }
    return product;
  }

  /**
   * Verify that a presentation belongs to the caller's organization
   * (through product.organizationId).
   */
  private async verifyPresentation(organizationId: string, id: string) {
    const presentation = await this.prisma.productPresentation.findFirst({
      where: { id },
      include: { product: true },
    });
    if (!presentation || presentation.product.organizationId !== organizationId) {
      throw new NotFoundException("Presentacion no encontrada");
    }
    return presentation;
  }

  /**
   * List all presentations for a given product.
   */
  async findByProduct(organizationId: string, productId: string) {
    await this.verifyProduct(organizationId, productId);
    return this.prisma.productPresentation.findMany({
      where: { productId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  }

  /**
   * List all presentations (with product info) for the organization.
   * Useful for dropdowns.
   */
  async findAll(organizationId: string) {
    return this.prisma.productPresentation.findMany({
      where: {
        product: { organizationId },
        isActive: true,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unitOfMeasure: true,
          },
        },
      },
      orderBy: [{ product: { name: "asc" } }, { name: "asc" }],
    });
  }

  /**
   * Create a new presentation for a product.
   */
  async create(
    organizationId: string,
    productId: string,
    dto: CreatePresentationDto,
    caller?: JwtPayload,
  ) {
    const product = await this.verifyProduct(organizationId, productId);

    // If this is set as default, unset other defaults for this product
    if (dto.isDefault) {
      await this.prisma.productPresentation.updateMany({
        where: { productId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const created = await this.prisma.productPresentation.create({
      data: {
        productId,
        name: dto.name,
        sku: dto.sku,
        barcode: dto.barcode,
        conversionFactor: dto.conversionFactor,
        conversionUnit: dto.conversionUnit,
        purchasePrice: dto.purchasePrice,
        salePrice: dto.salePrice,
        isDefault: dto.isDefault ?? false,
      },
    });

    if (caller) {
      await this.auditService.log({
        organizationId,
        userId: caller.sub,
        userName: caller.email,
        action: "CREATE",
        module: "INVENTARIOS",
        entityType: "ProductPresentation",
        entityId: created.id,
        description: `Presentacion creada: "${dto.name}" para producto ${product.name}`,
      });
    }

    return created;
  }

  /**
   * Update an existing presentation.
   */
  async update(
    organizationId: string,
    id: string,
    dto: UpdatePresentationDto,
    caller?: JwtPayload,
  ) {
    const existing = await this.verifyPresentation(organizationId, id);

    // If this is being set as default, unset other defaults for this product
    if (dto.isDefault) {
      await this.prisma.productPresentation.updateMany({
        where: { productId: existing.productId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.productPresentation.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sku !== undefined && { sku: dto.sku }),
        ...(dto.barcode !== undefined && { barcode: dto.barcode }),
        ...(dto.conversionFactor !== undefined && { conversionFactor: dto.conversionFactor }),
        ...(dto.conversionUnit !== undefined && { conversionUnit: dto.conversionUnit }),
        ...(dto.purchasePrice !== undefined && { purchasePrice: dto.purchasePrice }),
        ...(dto.salePrice !== undefined && { salePrice: dto.salePrice }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    if (caller) {
      await this.auditService.log({
        organizationId,
        userId: caller.sub,
        userName: caller.email,
        action: "UPDATE",
        module: "INVENTARIOS",
        entityType: "ProductPresentation",
        entityId: id,
        description: `Presentacion actualizada: "${existing.name}" del producto ${existing.product.name}`,
      });
    }

    return updated;
  }

  /**
   * Soft-delete (deactivate) a presentation.
   */
  async remove(organizationId: string, id: string, caller?: JwtPayload) {
    const existing = await this.verifyPresentation(organizationId, id);

    const result = await this.prisma.productPresentation.update({
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
        entityType: "ProductPresentation",
        entityId: id,
        description: `Presentacion desactivada: "${existing.name}" del producto ${existing.product.name}`,
      });
    }

    return result;
  }
}
