import { Controller, Get, Post, Patch, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { BankTransactionsService } from "./bank-transactions.service";

@ApiTags("Bancos - Transacciones")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("bancos/transactions")
export class BankTransactionsController {
  constructor(private bankTransactionsService: BankTransactionsService) {}

  @Get("account/:bankAccountId")
  @Permissions("bancos:view")
  findByAccount(@Param("bankAccountId") bankAccountId: string) {
    return this.bankTransactionsService.findByAccount(bankAccountId);
  }

  @Get(":id")
  @Permissions("bancos:view")
  findOne(@Param("id") id: string) {
    return this.bankTransactionsService.findOne(id);
  }

  @Post()
  @Permissions("bancos:create")
  create(
    @Body()
    body: {
      bankAccountId: string;
      transactionDate: string;
      amount: number;
      type: string;
      reference?: string;
      description?: string;
      importedFrom?: string;
    },
  ) {
    return this.bankTransactionsService.create(body);
  }

  @Patch(":id/reconcile")
  @Permissions("bancos:edit")
  reconcile(
    @Param("id") id: string,
    @Body() body: { reconciledWithType: string; reconciledWithId: string },
  ) {
    return this.bankTransactionsService.reconcile(id, body);
  }
}
