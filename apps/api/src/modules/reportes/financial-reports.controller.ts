import { Controller, Get, Query, Param, Res, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { FinancialReportsService } from "./financial-reports.service";

@ApiTags("Reportes - Financieros")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("reportes/financial")
export class FinancialReportsController {
  constructor(private financialReportsService: FinancialReportsService) {}

  @Get("pnl")
  @Permissions("reportes:view")
  getPnl(
    @CurrentUser() user: JwtPayload,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("branchId") branchId?: string,
  ) {
    return this.financialReportsService.getPnl(
      user.organizationId,
      startDate,
      endDate,
      branchId || undefined,
    );
  }

  @Get("cash-flow")
  @Permissions("reportes:view")
  getCashFlow(
    @CurrentUser() user: JwtPayload,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.financialReportsService.getCashFlow(user.organizationId, startDate, endDate);
  }

  @Get("aging/receivable")
  @Permissions("reportes:view")
  getReceivableAging(@CurrentUser() user: JwtPayload) {
    return this.financialReportsService.getReceivableAging(user.organizationId);
  }

  @Get("aging/payable")
  @Permissions("reportes:view")
  getPayableAging(@CurrentUser() user: JwtPayload) {
    return this.financialReportsService.getPayableAging(user.organizationId);
  }

  @Get("export/pnl")
  @Permissions("reportes:view")
  async exportPnl(
    @CurrentUser() user: JwtPayload,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Res() res: Response,
  ) {
    const csv = await this.financialReportsService.exportPnlExcel(
      user.organizationId,
      startDate,
      endDate,
    );

    const filename = `Estado_Resultados_${startDate}_${endDate}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  }

  @Get("export/aging/:type")
  @Permissions("reportes:view")
  async exportAging(
    @CurrentUser() user: JwtPayload,
    @Param("type") type: string,
    @Res() res: Response,
  ) {
    const agingType = type === "payable" ? "payable" : "receivable";
    const csv = await this.financialReportsService.exportAgingExcel(user.organizationId, agingType);

    const label = agingType === "receivable" ? "Cuentas_por_Cobrar" : "Cuentas_por_Pagar";
    const filename = `Antiguedad_${label}_${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  }
}
