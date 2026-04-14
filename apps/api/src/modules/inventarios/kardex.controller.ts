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
import { KardexService } from "./kardex.service";

@ApiTags("Inventarios - Kardex")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, BranchAccessGuard)
@Controller("inventarios/kardex")
export class KardexController {
  constructor(private kardexService: KardexService) {}

  /**
   * GET /inventarios/kardex/global
   * Cross-branch movement report.
   * Must be defined BEFORE :productId to avoid route collision.
   */
  @Get("global")
  @Permissions("inventarios:view")
  getGlobalKardex(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId?: string,
    @Query("productId") productId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("movementType") movementType?: string,
    @Query("groupBy") groupBy?: "product" | "branch" | "movementType",
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.kardexService.getGlobalKardex(user.organizationId, {
      branchId,
      productId,
      dateFrom,
      dateTo,
      movementType,
      groupBy,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * GET /inventarios/kardex/branch/:branchId
   * All movements for a branch.
   * Must be defined BEFORE :productId to avoid route collision.
   */
  @Get("branch/:branchId")
  @Permissions("inventarios:view")
  getMovementsByBranch(
    @CurrentUser() user: JwtPayload,
    @Param("branchId") branchId: string,
    @Query("productId") productId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("movementType") movementType?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.kardexService.getMovementsByBranch(user.organizationId, branchId, {
      productId,
      dateFrom,
      dateTo,
      movementType,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * GET /inventarios/kardex/:productId/summary
   * Summary stats for a product.
   * Must be defined BEFORE the bare :productId route.
   */
  @Get(":productId/summary")
  @Permissions("inventarios:view")
  getKardexSummary(
    @CurrentUser() user: JwtPayload,
    @Param("productId") productId: string,
    @Query("branchId") branchId?: string,
  ) {
    return this.kardexService.getKardexSummary(
      user.organizationId,
      productId,
      branchId,
    );
  }

  /**
   * GET /inventarios/kardex/:productId
   * Full Kardex for a product.
   */
  @Get(":productId")
  @Permissions("inventarios:view")
  getKardex(
    @CurrentUser() user: JwtPayload,
    @Param("productId") productId: string,
    @Query("branchId") branchId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("movementType") movementType?: string,
  ) {
    return this.kardexService.getKardex(user.organizationId, productId, {
      branchId,
      dateFrom,
      dateTo,
      movementType,
    });
  }
}
