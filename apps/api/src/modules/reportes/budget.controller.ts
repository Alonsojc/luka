import { Controller, Get, Post, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { BudgetService } from "./budget.service";

@ApiTags("Reportes - Presupuesto")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("reportes/budget")
export class BudgetController {
  constructor(private budgetService: BudgetService) {}

  @Post("set")
  @Permissions("reportes:update")
  setBudget(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      branchId: string;
      year: number;
      month: number;
      category: string;
      budgetAmount: number;
      notes?: string;
    },
  ) {
    return this.budgetService.setBudget(user.organizationId, body);
  }

  @Post("set-bulk")
  @Permissions("reportes:update")
  setBulkBudgets(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      branchId: string;
      year: number;
      budgets: { month: number; category: string; amount: number }[];
    },
  ) {
    return this.budgetService.setBulkBudgets(user.organizationId, body);
  }

  @Get()
  @Permissions("reportes:view")
  getBudgets(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId: string,
    @Query("year") year: string,
  ) {
    return this.budgetService.getBudgets(user.organizationId, branchId, parseInt(year, 10));
  }

  @Get("comparison")
  @Permissions("reportes:view")
  getComparison(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId: string,
    @Query("year") year: string,
    @Query("month") month: string,
  ) {
    return this.budgetService.getComparison(
      user.organizationId,
      branchId,
      parseInt(year, 10),
      parseInt(month, 10),
    );
  }

  @Get("annual")
  @Permissions("reportes:view")
  getAnnualComparison(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId: string,
    @Query("year") year: string,
  ) {
    return this.budgetService.getAnnualComparison(
      user.organizationId,
      branchId,
      parseInt(year, 10),
    );
  }

  @Get("multi-branch")
  @Permissions("reportes:view")
  getMultiBranchComparison(
    @CurrentUser() user: JwtPayload,
    @Query("year") year: string,
    @Query("month") month: string,
  ) {
    return this.budgetService.getMultiBranchComparison(
      user.organizationId,
      parseInt(year, 10),
      parseInt(month, 10),
    );
  }

  @Post("copy")
  @Permissions("reportes:update")
  copyBudget(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      branchId: string;
      fromYear: number;
      toYear: number;
      adjustmentPercent?: number;
    },
  ) {
    return this.budgetService.copyBudgetFromPreviousYear(
      user.organizationId,
      body.branchId,
      body.fromYear,
      body.toYear,
      body.adjustmentPercent,
    );
  }
}
