import { Module } from "@nestjs/common";
import { ReportesController } from "./reportes.controller";
import { ReportesService } from "./reportes.service";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";
import { RoleDashboardController } from "./role-dashboard.controller";
import { RoleDashboardService } from "./role-dashboard.service";
import { BudgetController } from "./budget.controller";
import { BudgetService } from "./budget.service";
import { FinancialReportsController } from "./financial-reports.controller";
import { FinancialReportsService } from "./financial-reports.service";

@Module({
  controllers: [ReportesController, AnalyticsController, RoleDashboardController, BudgetController, FinancialReportsController],
  providers: [ReportesService, AnalyticsService, RoleDashboardService, BudgetService, FinancialReportsService],
  exports: [ReportesService, AnalyticsService, RoleDashboardService, BudgetService, FinancialReportsService],
})
export class ReportesModule {}
