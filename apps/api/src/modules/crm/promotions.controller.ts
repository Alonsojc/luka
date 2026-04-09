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
import { PromotionsService } from "./promotions.service";

@ApiTags("CRM - Promociones")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("crm/promotions")
export class PromotionsController {
  constructor(private promotionsService: PromotionsService) {}

  @Get()
  @Permissions("crm:view")
  findAll(@CurrentUser() user: JwtPayload) {
    return this.promotionsService.findAll(user.organizationId);
  }

  @Get("active")
  @Permissions("crm:view")
  findActive(@CurrentUser() user: JwtPayload) {
    return this.promotionsService.findActive(user.organizationId);
  }

  @Get(":id")
  @Permissions("crm:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.promotionsService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions("crm:create")
  create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      name: string;
      type: string;
      conditions?: Record<string, any>;
      startDate: string;
      endDate: string;
      applicableBranches?: string[];
    },
  ) {
    return this.promotionsService.create(user.organizationId, body);
  }

  @Patch(":id")
  @Permissions("crm:edit")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      conditions?: Record<string, any>;
      startDate?: string;
      endDate?: string;
      isActive?: boolean;
      applicableBranches?: string[];
    },
  ) {
    return this.promotionsService.update(user.organizationId, id, body);
  }

  @Delete(":id")
  @Permissions("crm:delete")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.promotionsService.remove(user.organizationId, id);
  }
}
