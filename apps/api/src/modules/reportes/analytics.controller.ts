import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { AnalyticsService } from "./analytics.service";

@ApiTags("Reportes - Analytics")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("reportes/analytics")
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get("trends")
  @Permissions("reportes:view")
  getTrends(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getTrends(user.organizationId);
  }

  @Get("branch-comparison")
  @Permissions("reportes:view")
  getBranchComparison(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getBranchComparison(user.organizationId);
  }

  @Get("kpis")
  @Permissions("reportes:view")
  getKpis(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getKpis(user.organizationId);
  }
}
