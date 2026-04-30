import { Controller, Get, Put, Post, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { WorkyService } from "./worky.service";

@ApiTags("Nomina - Worky Integration")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("nomina/worky")
export class WorkyController {
  constructor(private workyService: WorkyService) {}

  @Get("config")
  @Permissions("nomina:view")
  getConfig(@CurrentUser() user: JwtPayload) {
    return this.workyService.getConfig(user.organizationId);
  }

  @Put("config")
  @Permissions("nomina:update")
  saveConfig(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      apiKey?: string;
      companyId?: string;
      syncFrequency?: string;
    },
  ) {
    return this.workyService.saveConfig(user.organizationId, body);
  }

  @Post("test-connection")
  @Permissions("nomina:update")
  testConnection(@CurrentUser() user: JwtPayload) {
    return this.workyService.testConnection(user.organizationId);
  }

  @Post("sync/employees")
  @Permissions("nomina:update")
  syncEmployees(@CurrentUser() user: JwtPayload) {
    return this.workyService.syncEmployees(user.organizationId);
  }

  @Post("import/csv")
  @Permissions("nomina:update")
  importCsv(
    @CurrentUser() user: JwtPayload,
    @Body() body: { csvContent: string; branchId: string },
  ) {
    return this.workyService.importFromCsv(user.organizationId, body.csvContent, body.branchId);
  }

  @Get("sync/history")
  @Permissions("nomina:view")
  getSyncHistory(@CurrentUser() user: JwtPayload) {
    return this.workyService.getSyncHistory(user.organizationId);
  }

  @Get("sync/:id")
  @Permissions("nomina:view")
  getSyncDetail(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.workyService.getSyncDetail(user.organizationId, id);
  }
}
