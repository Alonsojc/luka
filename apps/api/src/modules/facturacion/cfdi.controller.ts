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
import { CfdiService } from "./cfdi.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { UpdateInvoiceDto } from "./dto/update-invoice.dto";

@ApiTags("Facturacion")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("facturacion/cfdi")
export class CfdiController {
  constructor(private cfdiService: CfdiService) {}

  @Get()
  @Permissions("facturacion:view")
  findAll(@CurrentUser() user: JwtPayload) {
    return this.cfdiService.findAll(user.organizationId);
  }

  @Get(":id")
  @Permissions("facturacion:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.cfdiService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions("facturacion:create")
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.cfdiService.create(user.organizationId, user.sub, dto);
  }

  @Patch(":id")
  @Permissions("facturacion:edit")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.cfdiService.update(user.organizationId, id, dto);
  }

  @Patch(":id/cancel")
  @Permissions("facturacion:edit")
  cancel(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: { reason: string },
  ) {
    return this.cfdiService.cancel(user.organizationId, id, body.reason);
  }

  @Delete(":id")
  @Permissions("facturacion:delete")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.cfdiService.remove(user.organizationId, id);
  }
}
