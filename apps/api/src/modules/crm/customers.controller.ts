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
import { CustomersService } from "./customers.service";

@ApiTags("CRM - Clientes")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("crm/customers")
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @Get()
  @Permissions("crm:view")
  findAll(@CurrentUser() user: JwtPayload) {
    return this.customersService.findAll(user.organizationId);
  }

  @Get(":id")
  @Permissions("crm:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.customersService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions("crm:create")
  create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      name: string;
      email?: string;
      phone?: string;
      rfc?: string;
      preferredBranchId?: string;
    },
  ) {
    return this.customersService.create(user.organizationId, body);
  }

  @Patch(":id")
  @Permissions("crm:edit")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      email?: string;
      phone?: string;
      rfc?: string;
      preferredBranchId?: string;
      tier?: string;
    },
  ) {
    return this.customersService.update(user.organizationId, id, body);
  }

  @Delete(":id")
  @Permissions("crm:delete")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.customersService.remove(user.organizationId, id);
  }
}
