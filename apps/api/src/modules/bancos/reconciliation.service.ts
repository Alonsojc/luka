import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ImportTransactionItemDto } from "./dto/import-transactions.dto";

@Injectable()
export class ReconciliationService {
  constructor(private prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Import bank statement transactions
  // -------------------------------------------------------------------------

  async importStatement(
    organizationId: string,
    accountId: string,
    transactions: ImportTransactionItemDto[],
  ) {
    // Verify the account belongs to this organization
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: accountId, organizationId },
    });
    if (!account) {
      throw new NotFoundException("Cuenta bancaria no encontrada");
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const results = [];

      for (const txn of transactions) {
        const record = await tx.bankTransaction.create({
          data: {
            bankAccountId: accountId,
            transactionDate: new Date(txn.date),
            amount: txn.amount,
            type: txn.type,
            reference: txn.reference || null,
            description: txn.description || null,
            importedFrom: "bank_file",
          },
        });
        results.push(record);

        // Update bank account balance
        const balanceChange =
          txn.type === "credit" ? txn.amount : -txn.amount;
        await tx.bankAccount.update({
          where: { id: accountId },
          data: { currentBalance: { increment: balanceChange } },
        });
      }

      return results;
    });

    return {
      imported: created.length,
      transactions: created,
    };
  }

  // -------------------------------------------------------------------------
  // Auto-reconcile: match bank transactions with CxP, CxC, and payments
  // -------------------------------------------------------------------------

  async autoReconcile(organizationId: string, accountId: string) {
    // Verify account ownership
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: accountId, organizationId },
    });
    if (!account) {
      throw new NotFoundException("Cuenta bancaria no encontrada");
    }

    // Get all unreconciled transactions for this account
    const unreconciledTxns = await this.prisma.bankTransaction.findMany({
      where: {
        bankAccountId: accountId,
        isReconciled: false,
      },
      orderBy: { transactionDate: "desc" },
    });

    let matchedCount = 0;

    for (const txn of unreconciledTxns) {
      const txnAmount = Number(txn.amount);
      const txnDate = txn.transactionDate;

      // ---- Strategy 1: Exact match by amount + reference ----
      if (txn.reference) {
        // Try matching debit transactions against AccountPayable
        if (txn.type === "debit") {
          const payable = await this.prisma.accountPayable.findFirst({
            where: {
              organizationId,
              invoiceNumber: txn.reference,
              balanceDue: txnAmount,
              status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
            },
          });

          if (payable) {
            await this.prisma.bankTransaction.update({
              where: { id: txn.id },
              data: {
                isReconciled: true,
                reconciledWithType: "payable",
                reconciledWithId: payable.id,
              },
            });
            matchedCount++;
            continue;
          }
        }

        // Try matching credit transactions against AccountReceivable
        if (txn.type === "credit") {
          const receivable = await this.prisma.accountReceivable.findFirst({
            where: {
              organizationId,
              balanceDue: txnAmount,
              status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
            },
          });

          if (receivable) {
            await this.prisma.bankTransaction.update({
              where: { id: txn.id },
              data: {
                isReconciled: true,
                reconciledWithType: "receivable",
                reconciledWithId: receivable.id,
              },
            });
            matchedCount++;
            continue;
          }
        }

        // Try matching against Payment records by reference
        const payment = await this.prisma.payment.findFirst({
          where: {
            organizationId,
            reference: txn.reference,
            amount: txnAmount,
            bankAccountId: accountId,
          },
        });

        if (payment) {
          await this.prisma.bankTransaction.update({
            where: { id: txn.id },
            data: {
              isReconciled: true,
              reconciledWithType: "payment",
              reconciledWithId: payment.id,
            },
          });
          matchedCount++;
          continue;
        }
      }

      // ---- Strategy 2: Match by amount + date range (+-3 days) ----
      const dateFrom = new Date(txnDate);
      dateFrom.setDate(dateFrom.getDate() - 3);
      const dateTo = new Date(txnDate);
      dateTo.setDate(dateTo.getDate() + 3);

      if (txn.type === "debit") {
        const payable = await this.prisma.accountPayable.findFirst({
          where: {
            organizationId,
            balanceDue: txnAmount,
            status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
            dueDate: { gte: dateFrom, lte: dateTo },
          },
        });

        if (payable) {
          await this.prisma.bankTransaction.update({
            where: { id: txn.id },
            data: {
              isReconciled: true,
              reconciledWithType: "payable",
              reconciledWithId: payable.id,
            },
          });
          matchedCount++;
          continue;
        }
      }

      if (txn.type === "credit") {
        const receivable = await this.prisma.accountReceivable.findFirst({
          where: {
            organizationId,
            balanceDue: txnAmount,
            status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
            dueDate: { gte: dateFrom, lte: dateTo },
          },
        });

        if (receivable) {
          await this.prisma.bankTransaction.update({
            where: { id: txn.id },
            data: {
              isReconciled: true,
              reconciledWithType: "receivable",
              reconciledWithId: receivable.id,
            },
          });
          matchedCount++;
          continue;
        }
      }

      // Try matching payments by amount + date range (regardless of type)
      const payment = await this.prisma.payment.findFirst({
        where: {
          organizationId,
          amount: txnAmount,
          bankAccountId: accountId,
          paymentDate: { gte: dateFrom, lte: dateTo },
        },
      });

      if (payment) {
        await this.prisma.bankTransaction.update({
          where: { id: txn.id },
          data: {
            isReconciled: true,
            reconciledWithType: "payment",
            reconciledWithId: payment.id,
          },
        });
        matchedCount++;
      }
    }

    return {
      total: unreconciledTxns.length,
      matched: matchedCount,
      remaining: unreconciledTxns.length - matchedCount,
    };
  }

  // -------------------------------------------------------------------------
  // Manual reconciliation
  // -------------------------------------------------------------------------

  async manualReconcile(
    organizationId: string,
    transactionId: string,
    data: { type: string; entityId: string },
  ) {
    const transaction = await this.prisma.bankTransaction.findUnique({
      where: { id: transactionId },
      include: { bankAccount: true },
    });
    if (!transaction) {
      throw new NotFoundException("Transaccion no encontrada");
    }
    if (transaction.bankAccount.organizationId !== organizationId) {
      throw new NotFoundException("Transaccion no encontrada");
    }
    if (transaction.isReconciled) {
      throw new BadRequestException("La transaccion ya esta conciliada");
    }

    // Validate the entity exists
    if (data.type === "payable") {
      const payable = await this.prisma.accountPayable.findFirst({
        where: { id: data.entityId, organizationId },
      });
      if (!payable) {
        throw new NotFoundException("Cuenta por pagar no encontrada");
      }
    } else if (data.type === "receivable") {
      const receivable = await this.prisma.accountReceivable.findFirst({
        where: { id: data.entityId, organizationId },
      });
      if (!receivable) {
        throw new NotFoundException("Cuenta por cobrar no encontrada");
      }
    } else if (data.type === "payment") {
      const payment = await this.prisma.payment.findFirst({
        where: { id: data.entityId, organizationId },
      });
      if (!payment) {
        throw new NotFoundException("Pago no encontrado");
      }
    }

    return this.prisma.bankTransaction.update({
      where: { id: transactionId },
      data: {
        isReconciled: true,
        reconciledWithType: data.type,
        reconciledWithId: data.entityId,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Undo reconciliation
  // -------------------------------------------------------------------------

  async unreconcile(organizationId: string, transactionId: string) {
    const transaction = await this.prisma.bankTransaction.findUnique({
      where: { id: transactionId },
      include: { bankAccount: true },
    });
    if (!transaction) {
      throw new NotFoundException("Transaccion no encontrada");
    }
    if (transaction.bankAccount.organizationId !== organizationId) {
      throw new NotFoundException("Transaccion no encontrada");
    }
    if (!transaction.isReconciled) {
      throw new BadRequestException("La transaccion no esta conciliada");
    }

    return this.prisma.bankTransaction.update({
      where: { id: transactionId },
      data: {
        isReconciled: false,
        reconciledWithType: null,
        reconciledWithId: null,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Reconciliation summary / stats
  // -------------------------------------------------------------------------

  async getReconciliationSummary(
    organizationId: string,
    accountId: string,
    dateFrom?: string,
    dateTo?: string,
  ) {
    // Verify account ownership
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: accountId, organizationId },
    });
    if (!account) {
      throw new NotFoundException("Cuenta bancaria no encontrada");
    }

    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);

    const where: Record<string, unknown> = { bankAccountId: accountId };
    if (Object.keys(dateFilter).length > 0) {
      where.transactionDate = dateFilter;
    }

    const [total, reconciled, transactions] = await Promise.all([
      this.prisma.bankTransaction.count({ where }),
      this.prisma.bankTransaction.count({
        where: { ...where, isReconciled: true },
      }),
      this.prisma.bankTransaction.findMany({
        where,
        select: { amount: true, isReconciled: true },
      }),
    ]);

    let reconciledAmount = 0;
    let pendingAmount = 0;

    for (const t of transactions) {
      const amt = Number(t.amount);
      if (t.isReconciled) {
        reconciledAmount += amt;
      } else {
        pendingAmount += amt;
      }
    }

    const unreconciled = total - reconciled;
    const percentage = total > 0 ? Math.round((reconciled / total) * 100) : 0;

    return {
      total,
      reconciled,
      unreconciled,
      percentage,
      reconciledAmount: Math.round(reconciledAmount * 100) / 100,
      pendingAmount: Math.round(pendingAmount * 100) / 100,
    };
  }

  // -------------------------------------------------------------------------
  // Search payables/receivables for manual reconciliation
  // -------------------------------------------------------------------------

  async searchMatchCandidates(
    organizationId: string,
    query: { amount?: number; reference?: string; type?: string },
  ) {
    const results: {
      payables: unknown[];
      receivables: unknown[];
    } = { payables: [], receivables: [] };

    const amountFilter = query.amount ? { equals: query.amount } : undefined;

    if (!query.type || query.type === "payable") {
      results.payables = await this.prisma.accountPayable.findMany({
        where: {
          organizationId,
          status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
          ...(amountFilter ? { balanceDue: amountFilter } : {}),
          ...(query.reference
            ? {
                invoiceNumber: { contains: query.reference, mode: "insensitive" as const },
              }
            : {}),
        },
        include: { supplier: true, branch: true },
        take: 20,
        orderBy: { dueDate: "desc" },
      });
    }

    if (!query.type || query.type === "receivable") {
      results.receivables = await this.prisma.accountReceivable.findMany({
        where: {
          organizationId,
          status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
          ...(amountFilter ? { balanceDue: amountFilter } : {}),
        },
        include: { customer: true, branch: true },
        take: 20,
        orderBy: { dueDate: "desc" },
      });
    }

    return results;
  }
}
