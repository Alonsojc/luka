import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { SuppliersService } from "./suppliers.service";
import { CreateSupplierDto } from "./dto/create-supplier.dto";

@ApiTags("Compras - Proveedores")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("compras/suppliers")
export class SuppliersController {
  constructor(private suppliersService: SuppliersService) {}

  @Get()
  @Permissions("compras:view")
  findAll(@CurrentUser() user: JwtPayload) {
    return this.suppliersService.findAll(user.organizationId);
  }

  @Get(":id")
  @Permissions("compras:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.suppliersService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions("compras:create")
  create(@CurrentUser() user: JwtPayload, @Body() body: CreateSupplierDto) {
    return this.suppliersService.create(user.organizationId, body);
  }

  @Patch(":id")
  @Permissions("compras:edit")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      rfc?: string;
      contactName?: string;
      email?: string;
      phone?: string;
      address?: string;
      paymentTermsDays?: number;
      bankAccount?: string;
      clabe?: string;
      rating?: number;
      isActive?: boolean;
    },
  ) {
    return this.suppliersService.update(user.organizationId, id, body);
  }

  @Delete(":id")
  @Permissions("compras:delete")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.suppliersService.remove(user.organizationId, id);
  }
}
