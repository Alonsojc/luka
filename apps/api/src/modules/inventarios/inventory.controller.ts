import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { InventoryService } from "./inventory.service";

@ApiTags("Inventarios - Stock")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inventarios/inventory")
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get("export/stock")
  @Permissions("inventarios:view")
  async exportStock(
    @Query("branchId") branchId: string,
    @Res() res: Response,
  ) {
    const stock = await this.inventoryService.getStockByBranch(branchId);

    const header = [
      "SKU",
      "Producto",
      "Cantidad Actual",
      "Stock Minimo",
      "Ultimo Conteo",
    ].join(";");

    const rows = stock.map((s) =>
      [
        s.product?.sku || "",
        s.product?.name || "",
        Number(s.currentQuantity).toFixed(2),
        Number(s.minimumStock).toFixed(2),
        s.lastCountDate
          ? new Date(s.lastCountDate).toISOString().split("T")[0]
          : "",
      ].join(";"),
    );

    const csv = [header, ...rows].join("\n");
    const filename = `Stock_${branchId}_${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  }

  @Get("branch/:branchId")
  @Permissions("inventarios:view")
  getStockByBranch(@Param("branchId") branchId: string) {
    return this.inventoryService.getStockByBranch(branchId);
  }

  @Post("adjust")
  @Permissions("inventarios:edit")
  adjustStock(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      branchId: string;
      productId: string;
      quantity: number;
      notes?: string;
    },
  ) {
    return this.inventoryService.adjustStock(body.branchId, user.sub, {
      productId: body.productId,
      quantity: body.quantity,
      notes: body.notes,
    });
  }

  @Get("movements/:branchId")
  @Permissions("inventarios:view")
  getMovements(
    @Param("branchId") branchId: string,
    @Query("productId") productId?: string,
  ) {
    return this.inventoryService.getMovements(branchId, productId);
  }
}
