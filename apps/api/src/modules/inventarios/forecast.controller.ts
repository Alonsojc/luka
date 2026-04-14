import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { BranchAccessGuard } from "../../common/guards/branch-access.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { ForecastService } from "./forecast.service";

@ApiTags("Inventarios - Forecast")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, BranchAccessGuard)
@Controller("inventarios/forecast")
export class ForecastController {
  constructor(private forecastService: ForecastService) {}

  @Get("consumption/:productId")
  @Permissions("inventarios:view")
  getConsumptionHistory(
    @CurrentUser() user: JwtPayload,
    @Param("productId") productId: string,
    @Query("branchId") branchId?: string,
    @Query("period") period?: "daily" | "weekly" | "monthly",
  ) {
    return this.forecastService.getConsumptionHistory(
      user.organizationId,
      productId,
      branchId,
      period || "weekly",
    );
  }

  @Get("product/:productId")
  @Permissions("inventarios:view")
  forecastProduct(
    @CurrentUser() user: JwtPayload,
    @Param("productId") productId: string,
    @Query("branchId") branchId?: string,
    @Query("weeksAhead") weeksAhead?: string,
  ) {
    return this.forecastService.forecastDemand(
      user.organizationId,
      productId,
      branchId,
      weeksAhead ? parseInt(weeksAhead, 10) : 4,
    );
  }

  @Get("branch/:branchId")
  @Permissions("inventarios:view")
  forecastBranch(
    @CurrentUser() user: JwtPayload,
    @Param("branchId") branchId: string,
    @Query("weeksAhead") weeksAhead?: string,
  ) {
    return this.forecastService.forecastByBranch(
      user.organizationId,
      branchId,
      weeksAhead ? parseInt(weeksAhead, 10) : 4,
    );
  }

  @Get("summary")
  @Permissions("inventarios:view")
  forecastSummary(@CurrentUser() user: JwtPayload) {
    return this.forecastService.forecastSummary(user.organizationId);
  }

  @Get("suggested-requisition/:branchId")
  @Permissions("inventarios:view")
  suggestedRequisition(
    @CurrentUser() user: JwtPayload,
    @Param("branchId") branchId: string,
  ) {
    return this.forecastService.getSuggestedRequisition(
      user.organizationId,
      branchId,
    );
  }
}
