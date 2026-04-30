import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { BranchAccessGuard } from "../../common/guards/branch-access.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { LotsService } from "./lots.service";
import { CreateLotDto } from "./dto/create-lot.dto";
import { UpdateLotDto } from "./dto/update-lot.dto";

@ApiTags("Inventarios - Lotes")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, BranchAccessGuard)
@Controller("inventarios/lots")
export class LotsController {
  constructor(private lotsService: LotsService) {}

  @Get()
  @Permissions("inventarios:view")
  getLots(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId?: string,
    @Query("productId") productId?: string,
    @Query("status") status?: string,
    @Query("expiringBefore") expiringBefore?: string,
    @Query("expiringWithin") expiringWithin?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.lotsService.getLots(user.organizationId, {
      branchId,
      productId,
      status,
      expiringBefore,
      expiringWithin: expiringWithin ? parseInt(expiringWithin, 10) : undefined,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get("expiring")
  @Permissions("inventarios:view")
  getExpiringAlerts(
    @CurrentUser() user: JwtPayload,
    @Query("daysAhead") daysAhead?: string,
    @Query("branchId") branchId?: string,
  ) {
    return this.lotsService.getExpiringAlerts(
      user.organizationId,
      daysAhead ? parseInt(daysAhead, 10) : 7,
      branchId,
    );
  }

  @Get("summary")
  @Permissions("inventarios:view")
  getSummary(@CurrentUser() user: JwtPayload) {
    return this.lotsService.getExpirationSummary(user.organizationId);
  }

  @Get("reconciliation")
  @Permissions("inventarios:view")
  getLotStockReconciliation(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId?: string,
    @Query("productId") productId?: string,
  ) {
    return this.lotsService.getLotStockReconciliation(user.organizationId, {
      branchId,
      productId,
    });
  }

  @Get("by-product/:productId")
  @Permissions("inventarios:view")
  getLotsByProduct(
    @CurrentUser() user: JwtPayload,
    @Param("productId") productId: string,
    @Query("branchId") branchId?: string,
  ) {
    return this.lotsService.getLotsByProduct(user.organizationId, productId, branchId);
  }

  @Get(":id")
  @Permissions("inventarios:view")
  getLot(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.lotsService.getLot(user.organizationId, id);
  }

  @Post()
  @Permissions("inventarios:update")
  createLot(@CurrentUser() user: JwtPayload, @Body() dto: CreateLotDto) {
    return this.lotsService.createLot(user.organizationId, user.sub, dto);
  }

  @Post("auto-expire")
  @Permissions("inventarios:update")
  autoExpire(@CurrentUser() user: JwtPayload) {
    return this.lotsService.autoExpireLots(user.organizationId);
  }

  @Post(":id/consume")
  @Permissions("inventarios:update")
  consumeFromLot(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body("quantity") quantity: number,
  ) {
    return this.lotsService.consumeFromLot(user.organizationId, id, quantity, user.sub);
  }

  @Post(":id/dispose")
  @Permissions("inventarios:update")
  disposeLot(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body("reason") reason: string,
  ) {
    return this.lotsService.disposeLot(user.organizationId, id, user.sub, reason);
  }

  @Patch(":id")
  @Permissions("inventarios:update")
  updateLot(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateLotDto) {
    return this.lotsService.updateLot(user.organizationId, id, dto);
  }
}
