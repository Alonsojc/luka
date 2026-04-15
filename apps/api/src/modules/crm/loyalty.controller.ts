import { Controller, Get, Post, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { LoyaltyService } from "./loyalty.service";

@ApiTags("CRM - Lealtad")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("crm/loyalty")
export class LoyaltyController {
  constructor(private loyaltyService: LoyaltyService) {}

  @Get("customer/:customerId")
  @Permissions("crm:view")
  getTransactions(@Param("customerId") customerId: string) {
    return this.loyaltyService.getTransactions(customerId);
  }

  @Post("earn")
  @Permissions("crm:create")
  earn(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      customerId: string;
      branchId: string;
      points: number;
      referenceType?: string;
      referenceId?: string;
    },
  ) {
    return this.loyaltyService.earnPoints({
      ...body,
      organizationId: user.organizationId,
    });
  }

  @Post("redeem")
  @Permissions("crm:create")
  redeem(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      customerId: string;
      branchId: string;
      points: number;
      referenceType?: string;
      referenceId?: string;
    },
  ) {
    return this.loyaltyService.redeemPoints({
      ...body,
      organizationId: user.organizationId,
    });
  }

  @Post("adjust")
  @Permissions("crm:edit")
  adjust(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      customerId: string;
      branchId: string;
      points: number;
      referenceType?: string;
      referenceId?: string;
    },
  ) {
    return this.loyaltyService.adjustPoints({
      ...body,
      organizationId: user.organizationId,
    });
  }
}
