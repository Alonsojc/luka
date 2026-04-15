import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class JournalEntriesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.journalEntry.findMany({
      where: { organizationId },
      include: {
        branch: true,
        lines: { include: { account: true } },
      },
      orderBy: { entryDate: "desc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, organizationId },
      include: {
        branch: true,
        lines: { include: { account: true } },
      },
    });
    if (!entry) {
      throw new NotFoundException("Póliza no encontrada");
    }
    return entry;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      branchId?: string;
      entryDate: string;
      type: string;
      description: string;
      referenceType?: string;
      referenceId?: string;
      lines: Array<{
        accountId: string;
        debit: number;
        credit: number;
        description?: string;
      }>;
    },
  ) {
    const { lines, type, entryDate, ...entryData } = data;

    // Validate debits = credits
    const totalDebits = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredits = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new BadRequestException(
        `La partida doble no cuadra: débitos (${totalDebits}) != créditos (${totalCredits})`,
      );
    }

    return this.prisma.journalEntry.create({
      data: {
        organizationId,
        createdById: userId,
        entryDate: new Date(entryDate),
        type: type as any,
        ...entryData,
        lines: {
          create: lines,
        },
      },
      include: {
        branch: true,
        lines: { include: { account: true } },
      },
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: {
      description?: string;
      lines?: Array<{
        accountId: string;
        debit: number;
        credit: number;
        description?: string;
      }>;
    },
  ) {
    const entry = await this.findOne(organizationId, id);
    if (entry.status !== "DRAFT") {
      throw new BadRequestException("Solo se pueden editar pólizas en borrador");
    }

    const { lines, ...entryData } = data;

    return this.prisma.$transaction(async (tx) => {
      if (lines) {
        const totalDebits = lines.reduce((s, l) => s + l.debit, 0);
        const totalCredits = lines.reduce((s, l) => s + l.credit, 0);
        if (Math.abs(totalDebits - totalCredits) > 0.01) {
          throw new BadRequestException(
            `La partida doble no cuadra: débitos (${totalDebits}) != créditos (${totalCredits})`,
          );
        }

        await tx.journalEntryLine.deleteMany({
          where: { journalEntryId: id },
        });
        await tx.journalEntryLine.createMany({
          data: lines.map((l) => ({ journalEntryId: id, ...l })),
        });
      }

      return tx.journalEntry.update({
        where: { id },
        data: entryData,
        include: {
          branch: true,
          lines: { include: { account: true } },
        },
      });
    });
  }

  async post(organizationId: string, id: string, userId: string) {
    const entry = await this.findOne(organizationId, id);
    if (entry.status !== "DRAFT") {
      throw new BadRequestException("Solo se pueden publicar pólizas en borrador");
    }
    return this.prisma.journalEntry.update({
      where: { id },
      data: { status: "POSTED", postedById: userId },
      include: { lines: { include: { account: true } } },
    });
  }

  async reverse(organizationId: string, id: string) {
    const entry = await this.findOne(organizationId, id);
    if (entry.status !== "POSTED") {
      throw new BadRequestException("Solo se pueden reversar pólizas publicadas");
    }
    return this.prisma.journalEntry.update({
      where: { id },
      data: { status: "REVERSED" },
    });
  }
}
