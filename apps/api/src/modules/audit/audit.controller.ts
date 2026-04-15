import { Controller, Get, Delete, Query, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { AuditService } from "./audit.service";

@ApiTags("Audit")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("audit")
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @Permissions("configuracion:view")
  findAll(
    @CurrentUser() caller: JwtPayload,
    @Query("module") module?: string,
    @Query("action") action?: string,
    @Query("userId") userId?: string,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.auditService.findAll(caller.organizationId, {
      module,
      action,
      userId,
      entityType,
      entityId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: parseInt(page || "1"),
      limit: parseInt(limit || "20"),
    });
  }

  @Get("stats")
  @Permissions("configuracion:view")
  getStats(
    @CurrentUser() caller: JwtPayload,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.auditService.getStats(
      caller.organizationId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get("entity/:entityType/:entityId")
  @Permissions("configuracion:view")
  getEntityHistory(
    @CurrentUser() caller: JwtPayload,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
  ) {
    return this.auditService.getEntityHistory(caller.organizationId, entityType, entityId);
  }

  @Get(":id")
  @Permissions("configuracion:view")
  findOne(@CurrentUser() caller: JwtPayload, @Param("id") id: string) {
    return this.auditService.findOne(caller.organizationId, id);
  }

  @Delete("clean")
  @Permissions("configuracion:edit")
  cleanOld(@CurrentUser() caller: JwtPayload, @Body() body: { olderThanDays: number }) {
    const olderThan = new Date();
    olderThan.setDate(olderThan.getDate() - body.olderThanDays);
    return this.auditService.cleanOld(caller.organizationId, olderThan);
  }
}
