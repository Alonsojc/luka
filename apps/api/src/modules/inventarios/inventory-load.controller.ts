import {
  Controller,
  Get,
  Post,
  Param,
  Body,
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
import { InventoryLoadService } from "./inventory-load.service";
import {
  LoadInventoryDto,
  LoadCsvDto,
  AdjustInventoryDto,
} from "./dto/load-inventory.dto";

@ApiTags("Inventarios - Cargas")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, BranchAccessGuard)
@Controller("inventarios")
export class InventoryLoadController {
  constructor(private inventoryLoadService: InventoryLoadService) {}

  @Post("load")
  @Permissions("inventarios:edit")
  loadInventory(
    @CurrentUser() user: JwtPayload,
    @Body() dto: LoadInventoryDto,
  ) {
    return this.inventoryLoadService.loadInventory(user, {
      branchId: dto.branchId,
      items: dto.items,
    });
  }

  @Post("load-csv")
  @Permissions("inventarios:edit")
  loadCsv(
    @CurrentUser() user: JwtPayload,
    @Body() dto: LoadCsvDto,
  ) {
    return this.inventoryLoadService.loadFromCsv(
      user,
      dto.branchId,
      dto.rows,
    );
  }

  @Post("adjust")
  @Permissions("inventarios:edit")
  adjustInventory(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AdjustInventoryDto,
  ) {
    return this.inventoryLoadService.adjustInventory(user, {
      branchId: dto.branchId,
      productId: dto.productId,
      newQuantity: dto.newQuantity,
      reason: dto.reason,
    });
  }

  @Get("load-history/:branchId")
  @Permissions("inventarios:view")
  getLoadHistory(
    @CurrentUser() user: JwtPayload,
    @Param("branchId") branchId: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.inventoryLoadService.getLoadHistory(
      user,
      branchId,
      dateFrom,
      dateTo,
    );
  }

  @Get("stock/:branchId")
  @Permissions("inventarios:view")
  getStock(
    @CurrentUser() user: JwtPayload,
    @Param("branchId") branchId: string,
  ) {
    return this.inventoryLoadService.getInventoryByBranch(user, branchId);
  }
}
