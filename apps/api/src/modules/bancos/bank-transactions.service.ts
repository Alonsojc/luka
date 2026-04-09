import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class BankTransactionsService {
  constructor(private prisma: PrismaService) {}

  async findByAccount(bankAccountId: string) {
    return this.prisma.bankTransaction.findMany({
      where: { bankAccountId },
      orderBy: { transactionDate: "desc" },
      take: 200,
    });
  }

  async findOne(id: string) {
    const transaction = await this.prisma.bankTransaction.findUnique({
      where: { id },
      include: { bankAccount: true },
    });
    if (!transaction) {
      throw new NotFoundException("Transacción no encontrada");
    }
    return transaction;
  }

  async create(data: {
    bankAccountId: string;
    transactionDate: string;
    amount: number;
    type: string;
    reference?: string;
    description?: string;
    importedFrom?: string;
  }) {
    const { transactionDate, ...rest } = data;

    const transaction = await this.prisma.$transaction(async (tx) => {
      const txn = await tx.bankTransaction.create({
        data: {
          ...rest,
          transactionDate: new Date(transactionDate),
          importedFrom: rest.importedFrom || "manual",
        },
      });

      // Update bank account balance
      const balanceChange =
        data.type === "credit" ? data.amount : -data.amount;
      await tx.bankAccount.update({
        where: { id: data.bankAccountId },
        data: { currentBalance: { increment: balanceChange } },
      });

      return txn;
    });

    return transaction;
  }

  async reconcile(
    id: string,
    data: { reconciledWithType: string; reconciledWithId: string },
  ) {
    return this.prisma.bankTransaction.update({
      where: { id },
      data: {
        isReconciled: true,
        reconciledWithType: data.reconciledWithType,
        reconciledWithId: data.reconciledWithId,
      },
    });
  }
}
