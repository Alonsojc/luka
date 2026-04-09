import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
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
import { AutoPurchaseService } from "./auto-purchase.service";

@ApiTags("Compras - Reabastecimiento Automatico")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("compras")
export class AutoPurchaseController {
  constructor(private autoPurchaseService: AutoPurchaseService) {}

  @Get("reorder-alerts")
  @Permissions("compras:view")
  getReorderAlerts(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId?: string,
  ) {
    return this.autoPurchaseService.getReorderAlerts(
      user.organizationId,
      branchId,
    );
  }

  @Get("reorder-alerts/summary")
  @Permissions("compras:view")
  getReorderSummary(@CurrentUser() user: JwtPayload) {
    return this.autoPurchaseService.getReorderSummary(user.organizationId);
  }

  @Get("auto-purchase/preview/:branchId")
  @Permissions("compras:view")
  previewPurchaseOrders(
    @CurrentUser() user: JwtPayload,
    @Param("branchId") branchId: string,
  ) {
    return this.autoPurchaseService.previewPurchaseOrders(
      user.organizationId,
      branchId,
    );
  }

  @Post("auto-purchase/generate/:branchId")
  @Permissions("compras:create")
  generatePurchaseOrders(
    @CurrentUser() user: JwtPayload,
    @Param("branchId") branchId: string,
    @Body()
    body?: {
      multiplier?: number;
      productIds?: string[];
    },
  ) {
    return this.autoPurchaseService.generatePurchaseOrders(
      user.organizationId,
      branchId,
      user.sub,
      body,
    );
  }

  @Get("preferred-supplier/:productId")
  @Permissions("compras:view")
  getPreferredSupplier(
    @CurrentUser() user: JwtPayload,
    @Param("productId") productId: string,
  ) {
    return this.autoPurchaseService.getPreferredSupplier(
      user.organizationId,
      productId,
    );
  }
}
