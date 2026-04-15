import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { BranchesService } from "./branches.service";
import { CreateBranchDto } from "./dto/create-branch.dto";

@ApiTags("Branches")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("branches")
export class BranchesController {
  constructor(private branchesService: BranchesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.branchesService.findAll(user.organizationId);
  }

  @Get(":id")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.branchesService.findOne(user.organizationId, id);
  }

  @Post()
  @Roles("owner", "zone_manager")
  create(@CurrentUser() user: JwtPayload, @Body() body: CreateBranchDto) {
    return this.branchesService.create(user.organizationId, body);
  }

  @Patch(":id")
  @Roles("owner", "zone_manager")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      code?: string;
      city?: string;
      state?: string;
      address?: string;
      postalCode?: string;
      phone?: string;
      email?: string;
      timezone?: string;
      isActive?: boolean;
      corntechBranchId?: string;
      legalEntityId?: string | null;
    },
  ) {
    return this.branchesService.update(user.organizationId, id, body);
  }

  @Delete(":id")
  @Roles("owner", "zone_manager")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.branchesService.remove(user.organizationId, id);
  }
}
