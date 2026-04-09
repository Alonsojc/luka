import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
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
import { PurchaseOrdersService } from "./purchase-orders.service";

@ApiTags("Compras - Ordenes de Compra")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("compras/purchase-orders")
export class PurchaseOrdersController {
  constructor(private purchaseOrdersService: PurchaseOrdersService) {}

  @Get()
  @Permissions("compras:view")
  findAll(@CurrentUser() user: JwtPayload) {
    return this.purchaseOrdersService.findAll(user.organizationId);
  }

  @Get(":id")
  @Permissions("compras:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.purchaseOrdersService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions("compras:create")
  create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      branchId: string;
      supplierId: string;
      currency?: string;
      notes?: string;
      items: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
        unitOfMeasure: string;
      }>;
    },
  ) {
    return this.purchaseOrdersService.create(
      user.organizationId,
      user.sub,
      body,
    );
  }

  @Patch(":id")
  @Permissions("compras:edit")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body()
    body: {
      branchId?: string;
      supplierId?: string;
      notes?: string;
      items?: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
        unitOfMeasure: string;
      }>;
    },
  ) {
    return this.purchaseOrdersService.update(user.organizationId, id, body);
  }

  @Patch(":id/send")
  @Permissions("compras:edit")
  send(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.purchaseOrdersService.send(user.organizationId, id);
  }

  @Patch(":id/receive")
  @Permissions("compras:edit")
  receive(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body()
    body: { items: Array<{ itemId: string; receivedQuantity: number }> },
  ) {
    return this.purchaseOrdersService.receive(
      user.organizationId,
      id,
      user.sub,
      body.items,
    );
  }

  @Delete(":id")
  @Permissions("compras:delete")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.purchaseOrdersService.remove(user.organizationId, id);
  }
}
