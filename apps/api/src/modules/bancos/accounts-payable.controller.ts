import {
  Controller,
  Get,
  Post,
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
import { AccountsPayableService } from "./accounts-payable.service";

@ApiTags("Bancos - Cuentas por Pagar")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("bancos/payable")
export class AccountsPayableController {
  constructor(private accountsPayableService: AccountsPayableService) {}

  @Get()
  @Permissions("bancos:view")
  findAll(@CurrentUser() user: JwtPayload) {
    return this.accountsPayableService.findAll(user.organizationId);
  }

  @Get(":id")
  @Permissions("bancos:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.accountsPayableService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions("bancos:create")
  create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      supplierId: string;
      branchId: string;
      invoiceNumber?: string;
      amount: number;
      dueDate: string;
      purchaseOrderId?: string;
    },
  ) {
    return this.accountsPayableService.create(user.organizationId, body);
  }

  @Post(":id/payment")
  @Permissions("bancos:edit")
  registerPayment(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body()
    body: {
      amount: number;
      paymentDate: string;
      paymentMethod: string;
      bankAccountId?: string;
      reference?: string;
    },
  ) {
    return this.accountsPayableService.registerPayment(
      user.organizationId,
      id,
      body,
    );
  }
}
