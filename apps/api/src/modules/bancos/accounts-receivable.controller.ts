import {
  Controller,
  Get,
  Post,
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
import { AccountsReceivableService } from "./accounts-receivable.service";

@ApiTags("Bancos - Cuentas por Cobrar")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("bancos/receivable")
export class AccountsReceivableController {
  constructor(
    private accountsReceivableService: AccountsReceivableService,
  ) {}

  @Get()
  @Permissions("bancos:view")
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query("status") status?: string,
    @Query("customerId") customerId?: string,
    @Query("branchId") branchId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.accountsReceivableService.findAll(user.organizationId, {
      status,
      customerId,
      branchId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(":id")
  @Permissions("bancos:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.accountsReceivableService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions("bancos:create")
  create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      customerId?: string;
      branchId: string;
      cfdiId?: string;
      amount: number;
      dueDate: string;
    },
  ) {
    return this.accountsReceivableService.create(user.organizationId, body);
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
    return this.accountsReceivableService.registerPayment(
      user.organizationId,
      id,
      body,
    );
  }
}
