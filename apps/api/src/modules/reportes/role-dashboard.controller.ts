import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { RoleDashboardService } from "./role-dashboard.service";

@ApiTags("Reportes - Dashboard por Rol")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("reportes/dashboard")
export class RoleDashboardController {
  constructor(private roleDashboardService: RoleDashboardService) {}

  @Get("store/:branchId")
  @Permissions("reportes:view")
  getStoreDashboard(
    @CurrentUser() user: JwtPayload,
    @Param("branchId") branchId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const dateRange =
      startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : undefined;
    return this.roleDashboardService.getStoreDashboard(
      user.organizationId,
      branchId,
      user.sub,
      dateRange,
    );
  }

  @Get("cedis")
  @Permissions("reportes:view")
  getCedisDashboard(
    @CurrentUser() user: JwtPayload,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const dateRange =
      startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : undefined;
    return this.roleDashboardService.getCedisDashboard(user.organizationId, dateRange);
  }

  @Get("investor")
  @Permissions("reportes:view")
  getInvestorDashboard(
    @CurrentUser() user: JwtPayload,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const dateRange =
      startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : undefined;
    return this.roleDashboardService.getInvestorDashboard(user.organizationId, dateRange);
  }

  @Get("accountant")
  @Permissions("reportes:view")
  getAccountantDashboard(
    @CurrentUser() user: JwtPayload,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const dateRange =
      startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : undefined;
    return this.roleDashboardService.getAccountantDashboard(user.organizationId, dateRange);
  }

  @Get("my")
  @Permissions("reportes:view")
  getMyDashboard(
    @CurrentUser() user: JwtPayload,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const dateRange =
      startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : undefined;
    return this.roleDashboardService.getMyDashboard(
      user.organizationId,
      user.sub,
      user.roles,
      dateRange,
    );
  }
}
