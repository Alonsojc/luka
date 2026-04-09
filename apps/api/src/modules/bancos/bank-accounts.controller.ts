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
import { BankAccountsService } from "./bank-accounts.service";

@ApiTags("Bancos - Cuentas")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("bancos/accounts")
export class BankAccountsController {
  constructor(private bankAccountsService: BankAccountsService) {}

  @Get()
  @Permissions("bancos:view")
  findAll(@CurrentUser() user: JwtPayload) {
    return this.bankAccountsService.findAll(user.organizationId);
  }

  @Get(":id")
  @Permissions("bancos:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.bankAccountsService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions("bancos:create")
  create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      branchId?: string;
      bankName: string;
      accountNumber: string;
      clabe?: string;
      currency?: string;
      currentBalance?: number;
    },
  ) {
    return this.bankAccountsService.create(user.organizationId, body);
  }

  @Patch(":id")
  @Permissions("bancos:edit")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body()
    body: {
      branchId?: string;
      bankName?: string;
      accountNumber?: string;
      clabe?: string;
      currency?: string;
      isActive?: boolean;
    },
  ) {
    return this.bankAccountsService.update(user.organizationId, id, body);
  }

  @Delete(":id")
  @Permissions("bancos:delete")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.bankAccountsService.remove(user.organizationId, id);
  }
}
