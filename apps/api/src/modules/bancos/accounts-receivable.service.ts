import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class AccountsReceivableService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.accountReceivable.findMany({
      where: { organizationId },
      include: { customer: true, branch: true },
      orderBy: { dueDate: "asc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const receivable = await this.prisma.accountReceivable.findFirst({
      where: { id, organizationId },
      include: { customer: true, branch: true, payments: true },
    });
    if (!receivable) {
      throw new NotFoundException("Cuenta por cobrar no encontrada");
    }
    return receivable;
  }

  async create(
    organizationId: string,
    data: {
      customerId?: string;
      branchId: string;
      cfdiId?: string;
      amount: number;
      dueDate: string;
    },
  ) {
    return this.prisma.accountReceivable.create({
      data: {
        organizationId,
        ...data,
        balanceDue: data.amount,
        dueDate: new Date(data.dueDate),
      },
      include: { customer: true, branch: true },
    });
  }

  async registerPayment(
    organizationId: string,
    id: string,
    data: {
      amount: number;
      paymentDate: string;
      paymentMethod: string;
      bankAccountId?: string;
      reference?: string;
    },
  ) {
    const receivable = await this.findOne(organizationId, id);

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          organizationId,
          type: "receivable",
          receivableId: id,
          amount: data.amount,
          paymentDate: new Date(data.paymentDate),
          paymentMethod: data.paymentMethod,
          bankAccountId: data.bankAccountId,
          reference: data.reference,
        },
      });

      const newBalance = Number(receivable.balanceDue) - data.amount;
      const newStatus =
        newBalance <= 0 ? "PAID" : "PARTIALLY_PAID";

      const updated = await tx.accountReceivable.update({
        where: { id },
        data: {
          balanceDue: Math.max(0, newBalance),
          status: newStatus,
        },
        include: { customer: true, branch: true },
      });

      // Update bank balance if received into a bank account
      if (data.bankAccountId) {
        await tx.bankAccount.update({
          where: { id: data.bankAccountId },
          data: { currentBalance: { increment: data.amount } },
        });
      }

      return updated;
    });
  }
}
