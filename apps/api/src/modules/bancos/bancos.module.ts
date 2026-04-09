import { Module } from "@nestjs/common";
import { BankAccountsController } from "./bank-accounts.controller";
import { BankAccountsService } from "./bank-accounts.service";
import { BankTransactionsController } from "./bank-transactions.controller";
import { BankTransactionsService } from "./bank-transactions.service";
import { AccountsPayableController } from "./accounts-payable.controller";
import { AccountsPayableService } from "./accounts-payable.service";
import { AccountsReceivableController } from "./accounts-receivable.controller";
import { AccountsReceivableService } from "./accounts-receivable.service";
import { ReconciliationController } from "./reconciliation.controller";
import { ReconciliationService } from "./reconciliation.service";

@Module({
  controllers: [
    BankAccountsController,
    BankTransactionsController,
    AccountsPayableController,
    AccountsReceivableController,
    ReconciliationController,
  ],
  providers: [
    BankAccountsService,
    BankTransactionsService,
    AccountsPayableService,
    AccountsReceivableService,
    ReconciliationService,
  ],
  exports: [
    BankAccountsService,
    BankTransactionsService,
    AccountsPayableService,
    AccountsReceivableService,
    ReconciliationService,
  ],
})
export class BancosModule {}
