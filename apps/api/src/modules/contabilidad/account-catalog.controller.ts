import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { AccountCatalogService } from "./account-catalog.service";

@ApiTags("Contabilidad - Catalogo de Cuentas")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("contabilidad/accounts")
export class AccountCatalogController {
  constructor(private accountCatalogService: AccountCatalogService) {}

  @Get()
  @Permissions("contabilidad:view")
  findAll(@CurrentUser() user: JwtPayload) {
    return this.accountCatalogService.findAll(user.organizationId);
  }

  @Get(":id")
  @Permissions("contabilidad:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.accountCatalogService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions("contabilidad:create")
  create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      code: string;
      name: string;
      type: string;
      nature: string;
      satGroupCode?: string;
      parentAccountId?: string;
      isDetail?: boolean;
    },
  ) {
    return this.accountCatalogService.create(user.organizationId, body);
  }

  @Patch(":id")
  @Permissions("contabilidad:edit")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      satGroupCode?: string;
      parentAccountId?: string;
      isDetail?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.accountCatalogService.update(user.organizationId, id, body);
  }

  @Delete(":id")
  @Permissions("contabilidad:delete")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.accountCatalogService.remove(user.organizationId, id);
  }
}
