import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { ShiftsService } from "./shifts.service";

@ApiTags("Nomina - Turnos")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("nomina/shifts")
export class ShiftsController {
  constructor(private shiftsService: ShiftsService) {}

  // ── Templates ──

  @Get("templates")
  @Permissions("nomina:view")
  findAllTemplates(@CurrentUser() user: JwtPayload) {
    return this.shiftsService.findAllTemplates(user.organizationId);
  }

  @Post("templates")
  @Permissions("nomina:update")
  createTemplate(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      name: string;
      startTime: string;
      endTime: string;
      breakMinutes?: number;
      color?: string;
    },
  ) {
    return this.shiftsService.createTemplate(user.organizationId, body);
  }

  @Put("templates/:id")
  @Permissions("nomina:update")
  updateTemplate(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      startTime?: string;
      endTime?: string;
      breakMinutes?: number;
      color?: string;
    },
  ) {
    return this.shiftsService.updateTemplate(user.organizationId, id, body);
  }

  @Delete("templates/:id")
  @Permissions("nomina:update")
  deleteTemplate(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.shiftsService.deleteTemplate(user.organizationId, id);
  }

  // ── Schedule ──

  @Get("schedule")
  @Permissions("nomina:view")
  getWeekSchedule(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId: string,
    @Query("weekStart") weekStart: string,
  ) {
    return this.shiftsService.getWeekSchedule(user.organizationId, branchId, new Date(weekStart));
  }

  @Post("assign")
  @Permissions("nomina:update")
  assignShift(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      employeeId: string;
      branchId: string;
      shiftTemplateId: string;
      date: string;
    },
  ) {
    return this.shiftsService.assignShift(user.organizationId, body);
  }

  @Post("assign/bulk")
  @Permissions("nomina:update")
  bulkAssign(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      employeeId: string;
      branchId: string;
      shiftTemplateId: string;
      dates: string[];
    },
  ) {
    return this.shiftsService.bulkAssign(user.organizationId, body);
  }

  @Delete("assign/:id")
  @Permissions("nomina:update")
  removeAssignment(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.shiftsService.removeAssignment(user.organizationId, id);
  }

  // ── Employee schedule ──

  @Get("employee/:employeeId")
  @Permissions("nomina:view")
  getEmployeeSchedule(
    @CurrentUser() user: JwtPayload,
    @Param("employeeId") employeeId: string,
    @Query("month") month: string,
    @Query("year") year: string,
  ) {
    return this.shiftsService.getEmployeeSchedule(
      user.organizationId,
      employeeId,
      parseInt(month, 10),
      parseInt(year, 10),
    );
  }

  // ── Summary ──

  @Get("summary")
  @Permissions("nomina:view")
  getWeekSummary(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId: string,
    @Query("weekStart") weekStart: string,
  ) {
    return this.shiftsService.getWeekSummary(user.organizationId, branchId, new Date(weekStart));
  }
}
