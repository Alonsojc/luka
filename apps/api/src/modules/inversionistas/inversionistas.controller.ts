import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { InversionistasService } from "./inversionistas.service";

@ApiTags("Inversionistas")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inversionistas")
export class InversionistasController {
  constructor(private inversionistasService: InversionistasService) {}

  @Get("profitability/by-branch")
  @Roles("owner", "investor")
  profitabilityByBranch(
    @CurrentUser() user: JwtPayload,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.inversionistasService.profitabilityByBranch(
      user.organizationId,
      startDate,
      endDate,
    );
  }

  @Get("pnl")
  @Roles("owner", "investor")
  consolidatedPnL(
    @CurrentUser() user: JwtPayload,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.inversionistasService.consolidatedPnL(
      user.organizationId,
      startDate,
      endDate,
    );
  }

  @Get("roi")
  @Roles("owner", "investor")
  roiSummary(
    @CurrentUser() user: JwtPayload,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.inversionistasService.roiSummary(
      user.organizationId,
      startDate,
      endDate,
    );
  }
}
