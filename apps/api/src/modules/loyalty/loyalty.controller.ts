import { Controller, Get, Post, Put, Patch, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { LoyaltyService } from "./loyalty.service";
import { EarnPointsDto } from "./dto/earn-points.dto";
import { RedeemPointsDto } from "./dto/redeem-points.dto";
import { AdjustPointsDto } from "./dto/adjust-points.dto";
import { CreateRewardDto, UpdateRewardDto } from "./dto/create-reward.dto";
import { UpdateProgramDto } from "./dto/update-program.dto";

@ApiTags("Loyalty")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("loyalty")
export class LoyaltyController {
  constructor(private loyaltyService: LoyaltyService) {}

  // ----- Program config -----

  @Get("program")
  @Permissions("crm:view")
  getProgram(@CurrentUser() user: JwtPayload) {
    return this.loyaltyService.getProgram(user.organizationId);
  }

  @Put("program")
  @Permissions("crm:edit")
  updateProgram(@CurrentUser() user: JwtPayload, @Body() body: UpdateProgramDto) {
    return this.loyaltyService.updateProgram(user.organizationId, body);
  }

  // ----- Customers -----

  @Get("customers")
  @Permissions("crm:view")
  getCustomers(@CurrentUser() user: JwtPayload) {
    return this.loyaltyService.getCustomers(user.organizationId);
  }

  @Get("customers/:id")
  @Permissions("crm:view")
  getCustomerDetail(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.loyaltyService.getCustomerDetail(user.organizationId, id);
  }

  // ----- Points operations -----

  @Post("earn")
  @Permissions("crm:create")
  earnPoints(@CurrentUser() user: JwtPayload, @Body() body: EarnPointsDto) {
    return this.loyaltyService.earnPoints(user.organizationId, body);
  }

  @Post("redeem")
  @Permissions("crm:create")
  redeemPoints(@CurrentUser() user: JwtPayload, @Body() body: RedeemPointsDto) {
    return this.loyaltyService.redeemPoints(user.organizationId, body);
  }

  @Post("adjust")
  @Permissions("crm:edit")
  adjustPoints(@CurrentUser() user: JwtPayload, @Body() body: AdjustPointsDto) {
    return this.loyaltyService.adjustPoints(user.organizationId, body);
  }

  // ----- Rewards -----

  @Get("rewards")
  @Permissions("crm:view")
  getRewards(@CurrentUser() user: JwtPayload) {
    return this.loyaltyService.getRewards(user.organizationId);
  }

  @Post("rewards")
  @Permissions("crm:create")
  createReward(@CurrentUser() user: JwtPayload, @Body() body: CreateRewardDto) {
    return this.loyaltyService.createReward(user.organizationId, body);
  }

  @Patch("rewards/:id")
  @Permissions("crm:edit")
  updateReward(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: UpdateRewardDto,
  ) {
    return this.loyaltyService.updateReward(user.organizationId, id, body);
  }

  @Delete("rewards/:id")
  @Permissions("crm:delete")
  deactivateReward(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.loyaltyService.deactivateReward(user.organizationId, id);
  }

  // ----- Dashboard -----

  @Get("dashboard")
  @Permissions("crm:view")
  getDashboard(@CurrentUser() user: JwtPayload) {
    return this.loyaltyService.getDashboard(user.organizationId);
  }
}
