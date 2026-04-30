import { Controller, Get, Post, Param, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { ReconciliationService } from "./reconciliation.service";
import { ImportTransactionsDto } from "./dto/import-transactions.dto";
import { ManualReconcileDto } from "./dto/manual-reconcile.dto";

@ApiTags("Bancos - Conciliacion")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("bancos")
export class ReconciliationController {
  constructor(private reconciliationService: ReconciliationService) {}

  // POST /bancos/accounts/:id/import
  @Post("accounts/:id/import")
  @Permissions("bancos:create")
  importTransactions(
    @CurrentUser() user: JwtPayload,
    @Param("id") accountId: string,
    @Body() dto: ImportTransactionsDto,
  ) {
    return this.reconciliationService.importStatement(
      user.organizationId,
      accountId,
      dto.transactions,
    );
  }

  // POST /bancos/accounts/:id/reconcile
  @Post("accounts/:id/reconcile")
  @Permissions("bancos:update")
  autoReconcile(@CurrentUser() user: JwtPayload, @Param("id") accountId: string) {
    return this.reconciliationService.autoReconcile(user.organizationId, accountId);
  }

  // POST /bancos/transactions/:id/reconcile
  @Post("transactions/:id/reconcile")
  @Permissions("bancos:update")
  manualReconcile(
    @CurrentUser() user: JwtPayload,
    @Param("id") transactionId: string,
    @Body() dto: ManualReconcileDto,
  ) {
    return this.reconciliationService.manualReconcile(user.organizationId, transactionId, dto);
  }

  // POST /bancos/transactions/:id/unreconcile
  @Post("transactions/:id/unreconcile")
  @Permissions("bancos:update")
  unreconcile(@CurrentUser() user: JwtPayload, @Param("id") transactionId: string) {
    return this.reconciliationService.unreconcile(user.organizationId, transactionId);
  }

  // GET /bancos/accounts/:id/reconciliation-summary
  @Get("accounts/:id/reconciliation-summary")
  @Permissions("bancos:view")
  getReconciliationSummary(
    @CurrentUser() user: JwtPayload,
    @Param("id") accountId: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.reconciliationService.getReconciliationSummary(
      user.organizationId,
      accountId,
      dateFrom,
      dateTo,
    );
  }

  // GET /bancos/reconciliation/search-matches
  @Get("reconciliation/search-matches")
  @Permissions("bancos:view")
  searchMatchCandidates(
    @CurrentUser() user: JwtPayload,
    @Query("amount") amount?: string,
    @Query("reference") reference?: string,
    @Query("type") type?: string,
  ) {
    return this.reconciliationService.searchMatchCandidates(user.organizationId, {
      amount: amount ? Number(amount) : undefined,
      reference,
      type,
    });
  }
}
