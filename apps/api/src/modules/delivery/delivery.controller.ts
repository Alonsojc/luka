import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { DeliveryService } from "./delivery.service";
import { CreateDeliveryOrderDto } from "./dto/create-order.dto";
import { UpdateDeliveryStatusDto } from "./dto/update-status.dto";
import { CreateDeliveryConfigDto } from "./dto/create-config.dto";

@ApiTags("Delivery")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("delivery")
export class DeliveryController {
  constructor(private deliveryService: DeliveryService) {}

  // ---------------------------------------------------------------
  // Orders
  // ---------------------------------------------------------------

  @Get("orders")
  @Permissions("delivery:view")
  findAllOrders(
    @CurrentUser() user: JwtPayload,
    @Query("platform") platform?: string,
    @Query("branchId") branchId?: string,
    @Query("status") status?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.deliveryService.findAllOrders(user.organizationId, {
      platform,
      branchId,
      status,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get("orders/:id")
  @Permissions("delivery:view")
  findOneOrder(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.deliveryService.findOneOrder(user.organizationId, id);
  }

  @Post("orders")
  @Permissions("delivery:create")
  createOrder(@CurrentUser() user: JwtPayload, @Body() dto: CreateDeliveryOrderDto) {
    return this.deliveryService.createOrder(user.organizationId, dto);
  }

  @Patch("orders/:id/status")
  @Permissions("delivery:edit")
  updateOrderStatus(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveryService.updateOrderStatus(user.organizationId, id, dto);
  }

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------

  @Get("summary")
  @Permissions("delivery:view")
  getSummary(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.deliveryService.getSummary(user.organizationId, {
      branchId,
      dateFrom,
      dateTo,
    });
  }

  // ---------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------

  @Get("config")
  @Permissions("delivery:view")
  findAllConfigs(@CurrentUser() user: JwtPayload) {
    return this.deliveryService.findAllConfigs(user.organizationId);
  }

  @Post("config")
  @Permissions("delivery:edit")
  upsertConfig(@CurrentUser() user: JwtPayload, @Body() dto: CreateDeliveryConfigDto) {
    return this.deliveryService.upsertConfig(user.organizationId, dto);
  }

  @Post("sync")
  @Permissions("delivery:edit")
  triggerSync(@CurrentUser() user: JwtPayload, @Body("platform") platform: string) {
    return this.deliveryService.triggerSync(user.organizationId, platform);
  }
}
