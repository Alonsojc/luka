import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
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
import { TransfersService } from "./transfers.service";
import { CreateTransferDto } from "./dto/create-transfer.dto";
import { ShipTransferDto } from "./dto/ship-transfer.dto";
import { ReceiveTransferDto } from "./dto/receive-transfer.dto";

@ApiTags("Inventarios - Transferencias")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inventarios/transfers")
export class TransfersController {
  constructor(private transfersService: TransfersService) {}

  @Get()
  @Permissions("inventarios:view")
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query("status") status?: string,
    @Query("fromBranchId") fromBranchId?: string,
    @Query("toBranchId") toBranchId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.transfersService.findAll(
      user.organizationId,
      { status, fromBranchId, toBranchId, dateFrom, dateTo },
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get(":id")
  @Permissions("inventarios:view")
  findOne(@Param("id") id: string) {
    return this.transfersService.findOne(id);
  }

  @Post()
  @Permissions("inventarios:create")
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTransferDto,
  ) {
    return this.transfersService.create(user.sub, user.organizationId, dto);
  }

  @Patch(":id/approve")
  @Permissions("inventarios:edit")
  approve(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.transfersService.approve(id, user.sub, user.organizationId);
  }

  @Patch(":id/ship")
  @Permissions("inventarios:edit")
  ship(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: ShipTransferDto,
  ) {
    return this.transfersService.ship(id, dto, user.sub, user.organizationId);
  }

  @Patch(":id/receive")
  @Permissions("inventarios:edit")
  receive(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: ReceiveTransferDto,
  ) {
    return this.transfersService.receive(id, dto, user.sub, user.organizationId);
  }

  @Patch(":id/cancel")
  @Permissions("inventarios:edit")
  cancel(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.transfersService.cancel(id, user.sub, user.organizationId);
  }
}
