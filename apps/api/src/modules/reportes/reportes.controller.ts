import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { ReportesService } from "./reportes.service";

@ApiTags("Reportes")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("reportes")
export class ReportesController {
  constructor(private reportesService: ReportesService) {}

  @Get("sales/by-branch")
  @Permissions("reportes:view")
  salesByBranch(
    @CurrentUser() user: JwtPayload,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.reportesService.salesByBranch(
      user.organizationId,
      startDate,
      endDate,
    );
  }

  @Get("sales/by-product/:branchId")
  @Permissions("reportes:view")
  salesByProduct(
    @CurrentUser() user: JwtPayload,
    @Param("branchId") branchId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.reportesService.salesByProduct(
      user.organizationId,
      branchId,
      startDate,
      endDate,
    );
  }

  @Get("sales/trends")
  @Permissions("reportes:view")
  salesTrends(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId: string | undefined,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.reportesService.salesTrends(
      user.organizationId,
      branchId,
      startDate,
      endDate,
    );
  }

  @Get("cash-closings/:branchId")
  @Permissions("reportes:view")
  cashClosingSummary(
    @CurrentUser() user: JwtPayload,
    @Param("branchId") branchId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.reportesService.cashClosingSummary(
      user.organizationId,
      branchId,
      startDate,
      endDate,
    );
  }

  @Get("inventory/valuation")
  @Permissions("reportes:view")
  inventoryValuation(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId?: string,
  ) {
    return this.reportesService.inventoryValuation(
      user.organizationId,
      branchId,
    );
  }
}
