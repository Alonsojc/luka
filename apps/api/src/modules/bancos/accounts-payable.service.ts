import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class AccountsPayableService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.accountPayable.findMany({
      where: { organizationId },
      include: { supplier: true, branch: true },
      orderBy: { dueDate: "asc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const payable = await this.prisma.accountPayable.findFirst({
      where: { id, organizationId },
      include: { supplier: true, branch: true, payments: true },
    });
    if (!payable) {
      throw new NotFoundException("Cuenta por pagar no encontrada");
    }
    return payable;
  }

  async create(
    organizationId: string,
    data: {
      supplierId: string;
      branchId: string;
      invoiceNumber?: string;
      amount: number;
      dueDate: string;
      purchaseOrderId?: string;
    },
  ) {
    return this.prisma.accountPayable.create({
      data: {
        organizationId,
        ...data,
        balanceDue: data.amount,
        dueDate: new Date(data.dueDate),
      },
      include: { supplier: true, branch: true },
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
    const payable = await this.findOne(organizationId, id);

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          organizationId,
          type: "payable",
          payableId: id,
          amount: data.amount,
          paymentDate: new Date(data.paymentDate),
          paymentMethod: data.paymentMethod,
          bankAccountId: data.bankAccountId,
          reference: data.reference,
        },
      });

      const newBalance = Number(payable.balanceDue) - data.amount;
      const newStatus =
        newBalance <= 0 ? "PAID" : "PARTIALLY_PAID";

      const updated = await tx.accountPayable.update({
        where: { id },
        data: {
          balanceDue: Math.max(0, newBalance),
          status: newStatus,
        },
        include: { supplier: true, branch: true },
      });

      // Update bank balance if paid through a bank account
      if (data.bankAccountId) {
        await tx.bankAccount.update({
          where: { id: data.bankAccountId },
          data: { currentBalance: { decrement: data.amount } },
        });
      }

      return updated;
    });
  }
}
