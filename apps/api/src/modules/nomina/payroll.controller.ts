import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { PayrollService } from "./payroll.service";

@ApiTags("Nomina - Periodos")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("nomina/payroll")
export class PayrollController {
  constructor(private payrollService: PayrollService) {}

  @Get()
  @Permissions("nomina:view")
  findAll(@CurrentUser() user: JwtPayload) {
    return this.payrollService.findAllPeriods(user.organizationId);
  }

  @Get("export/:periodId")
  @Permissions("nomina:view")
  async exportPayroll(
    @CurrentUser() user: JwtPayload,
    @Param("periodId") periodId: string,
    @Res() res: Response,
  ) {
    const period = await this.payrollService.findPeriod(
      user.organizationId,
      periodId,
    );

    const header = [
      "Numero Empleado",
      "Nombre",
      "Apellido",
      "Sucursal",
      "Dias Trabajados",
      "Salario Bruto",
      "ISR Retenido",
      "IMSS Empleado",
      "Salario Neto",
      "IMSS Patron",
      "RCV Patron",
      "Infonavit Patron",
    ].join(";");

    const rows = period.receipts.map((r) =>
      [
        r.employee?.employeeNumber || "",
        r.employee?.firstName || "",
        r.employee?.lastName || "",
        r.branch?.name || "",
        r.daysWorked,
        Number(r.grossSalary).toFixed(2),
        Number(r.isrWithheld).toFixed(2),
        Number(r.imssEmployee).toFixed(2),
        Number(r.netSalary).toFixed(2),
        Number(r.employerImss).toFixed(2),
        Number(r.employerRcv).toFixed(2),
        Number(r.employerInfonavit).toFixed(2),
      ].join(";"),
    );

    const csv = [header, ...rows].join("\n");
    const startDate = new Date(period.startDate).toISOString().split("T")[0];
    const endDate = new Date(period.endDate).toISOString().split("T")[0];
    const filename = `Nomina_${startDate}_${endDate}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  }

  @Get(":id")
  @Permissions("nomina:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.payrollService.findPeriod(user.organizationId, id);
  }

  @Post()
  @Permissions("nomina:create")
  create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      periodType: string;
      startDate: string;
      endDate: string;
    },
  ) {
    return this.payrollService.createPeriod(user.organizationId, body);
  }

  @Post(":id/calculate")
  @Permissions("nomina:edit")
  calculate(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.payrollService.calculatePayroll(user.organizationId, id);
  }

  @Patch(":id/approve")
  @Permissions("nomina:edit")
  approve(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.payrollService.approvePeriod(user.organizationId, id);
  }
}
