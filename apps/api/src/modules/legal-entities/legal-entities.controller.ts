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
import { Roles } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { LegalEntitiesService } from "./legal-entities.service";
import { CreateLegalEntityDto } from "./dto/create-legal-entity.dto";
import { UpdateLegalEntityDto } from "./dto/update-legal-entity.dto";

@ApiTags("Legal Entities")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("legal-entities")
export class LegalEntitiesController {
  constructor(private legalEntitiesService: LegalEntitiesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.legalEntitiesService.findAll(user.organizationId);
  }

  @Get(":id")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.legalEntitiesService.findOne(user.organizationId, id);
  }

  @Post()
  @Roles("owner")
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateLegalEntityDto,
  ) {
    return this.legalEntitiesService.create(user.organizationId, dto);
  }

  @Patch(":id")
  @Roles("owner")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateLegalEntityDto,
  ) {
    return this.legalEntitiesService.update(user.organizationId, id, dto);
  }

  @Delete(":id")
  @Roles("owner")
  deactivate(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.legalEntitiesService.deactivate(user.organizationId, id);
  }

  @Get(":id/branches")
  findBranches(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.legalEntitiesService.findBranches(user.organizationId, id);
  }

  @Post(":id/branches/:branchId")
  @Roles("owner", "zone_manager")
  assignBranch(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("branchId") branchId: string,
  ) {
    return this.legalEntitiesService.assignBranch(
      user.organizationId,
      id,
      branchId,
    );
  }

  @Delete(":id/branches/:branchId")
  @Roles("owner", "zone_manager")
  unassignBranch(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("branchId") branchId: string,
  ) {
    return this.legalEntitiesService.unassignBranch(
      user.organizationId,
      id,
      branchId,
    );
  }
}
