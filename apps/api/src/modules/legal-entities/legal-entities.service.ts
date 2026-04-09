import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateLegalEntityDto } from "./dto/create-legal-entity.dto";
import { UpdateLegalEntityDto } from "./dto/update-legal-entity.dto";

@Injectable()
export class LegalEntitiesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.legalEntity.findMany({
      where: { organizationId },
      include: {
        _count: { select: { branches: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const entity = await this.prisma.legalEntity.findFirst({
      where: { id, organizationId },
      include: {
        branches: {
          orderBy: { name: "asc" },
        },
      },
    });
    if (!entity) {
      throw new NotFoundException("Razon social no encontrada");
    }
    return entity;
  }

  async create(organizationId: string, dto: CreateLegalEntityDto) {
    // Check for duplicate RFC within org
    const existing = await this.prisma.legalEntity.findUnique({
      where: {
        organizationId_rfc: { organizationId, rfc: dto.rfc },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe una razon social con RFC ${dto.rfc}`,
      );
    }

    return this.prisma.legalEntity.create({
      data: {
        organizationId,
        name: dto.name,
        rfc: dto.rfc,
        razonSocial: dto.razonSocial,
        regimenFiscal: dto.regimenFiscal,
        address: dto.address,
        postalCode: dto.postalCode,
        logoUrl: dto.logoUrl,
      },
      include: {
        _count: { select: { branches: true } },
      },
    });
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateLegalEntityDto,
  ) {
    await this.findOne(organizationId, id);

    // If RFC is changing, check for duplicates
    if (dto.rfc) {
      const existing = await this.prisma.legalEntity.findFirst({
        where: {
          organizationId,
          rfc: dto.rfc,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictException(
          `Ya existe una razon social con RFC ${dto.rfc}`,
        );
      }
    }

    return this.prisma.legalEntity.update({
      where: { id },
      data: dto,
      include: {
        branches: { orderBy: { name: "asc" } },
        _count: { select: { branches: true } },
      },
    });
  }

  async deactivate(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.legalEntity.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async findBranches(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.branch.findMany({
      where: { organizationId, legalEntityId: id },
      orderBy: { name: "asc" },
    });
  }

  async assignBranch(
    organizationId: string,
    legalEntityId: string,
    branchId: string,
  ) {
    // Verify legal entity belongs to org
    await this.findOne(organizationId, legalEntityId);

    // Verify branch belongs to org
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId },
    });
    if (!branch) {
      throw new NotFoundException("Sucursal no encontrada");
    }

    return this.prisma.branch.update({
      where: { id: branchId },
      data: { legalEntityId },
    });
  }

  async unassignBranch(
    organizationId: string,
    legalEntityId: string,
    branchId: string,
  ) {
    // Verify legal entity belongs to org
    await this.findOne(organizationId, legalEntityId);

    // Verify branch belongs to this legal entity
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId, legalEntityId },
    });
    if (!branch) {
      throw new NotFoundException(
        "Sucursal no encontrada o no asignada a esta razon social",
      );
    }

    return this.prisma.branch.update({
      where: { id: branchId },
      data: { legalEntityId: null },
    });
  }
}
