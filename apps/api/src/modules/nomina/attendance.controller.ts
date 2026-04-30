import { Controller, Get, Post, Put, Param, Body, Query, Res, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { AttendanceService } from "./attendance.service";

@ApiTags("Nomina - Asistencia")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("nomina/attendance")
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Post("clock-in")
  @Permissions("nomina:update")
  clockIn(@CurrentUser() user: JwtPayload, @Body() body: { employeeId: string; branchId: string }) {
    return this.attendanceService.clockIn(user.organizationId, body.employeeId, body.branchId);
  }

  @Post("clock-out")
  @Permissions("nomina:update")
  clockOut(@CurrentUser() user: JwtPayload, @Body() body: { employeeId: string }) {
    return this.attendanceService.clockOut(user.organizationId, body.employeeId);
  }

  @Get("today")
  @Permissions("nomina:view")
  getToday(@CurrentUser() user: JwtPayload, @Query("branchId") branchId: string) {
    return this.attendanceService.getToday(user.organizationId, branchId);
  }

  @Get("range")
  @Permissions("nomina:view")
  getByDateRange(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.attendanceService.getByDateRange(user.organizationId, branchId, startDate, endDate);
  }

  @Get("export")
  @Permissions("nomina:view")
  async exportAttendance(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId: string,
    @Query("month") month: string,
    @Query("year") year: string,
    @Res() res: Response,
  ) {
    const data = await this.attendanceService.getBranchSummary(
      user.organizationId,
      branchId,
      parseInt(month, 10),
      parseInt(year, 10),
    );

    const header = [
      "Numero Empleado",
      "Nombre",
      "Apellido",
      "Puesto",
      "Dias Presentes",
      "Retardos",
      "Faltas",
      "Horas Totales",
      "Horas Promedio",
      "Tiempo Extra (min)",
    ].join(";");

    const rows = data.employees.map((e) =>
      [
        e.employee.employeeNumber,
        e.employee.firstName,
        e.employee.lastName,
        e.employee.jobPosition,
        e.present,
        e.late,
        e.absent,
        e.totalHours.toFixed(2),
        e.avgHours.toFixed(2),
        e.totalOvertimeMin,
      ].join(";"),
    );

    const csv = [header, ...rows].join("\n");
    const filename = `Asistencia_${month}_${year}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  }

  @Post("mark-absent")
  @Permissions("nomina:update")
  markAbsent(@CurrentUser() user: JwtPayload, @Body() body: { employeeId: string; date: string }) {
    return this.attendanceService.markAbsent(user.organizationId, body.employeeId, body.date);
  }

  @Post("mark-holiday")
  @Permissions("nomina:update")
  markHoliday(@CurrentUser() user: JwtPayload, @Body() body: { branchId: string; date: string }) {
    return this.attendanceService.markHoliday(user.organizationId, body.branchId, body.date);
  }

  @Put(":id")
  @Permissions("nomina:update")
  editRecord(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body()
    body: {
      clockIn?: string;
      clockOut?: string;
      status?: string;
      notes?: string;
      lateMinutes?: number;
      earlyLeaveMin?: number;
      overtimeMin?: number;
      workedHours?: number;
    },
  ) {
    return this.attendanceService.editRecord(user.organizationId, id, body);
  }

  @Get("employee/:employeeId")
  @Permissions("nomina:view")
  getEmployeeAttendance(
    @CurrentUser() user: JwtPayload,
    @Param("employeeId") employeeId: string,
    @Query("month") month: string,
    @Query("year") year: string,
  ) {
    return this.attendanceService.getEmployeeAttendance(
      user.organizationId,
      employeeId,
      parseInt(month, 10),
      parseInt(year, 10),
    );
  }

  @Get("summary")
  @Permissions("nomina:view")
  getBranchSummary(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId: string,
    @Query("month") month: string,
    @Query("year") year: string,
  ) {
    return this.attendanceService.getBranchSummary(
      user.organizationId,
      branchId,
      parseInt(month, 10),
      parseInt(year, 10),
    );
  }

  @Get("report")
  @Permissions("nomina:view")
  getAttendanceReport(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.attendanceService.getAttendanceReport(
      user.organizationId,
      branchId,
      startDate,
      endDate,
    );
  }
}
