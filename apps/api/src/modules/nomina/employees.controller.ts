import { Controller, Get, Post, Patch, Param, Body, Res, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { EmployeesService } from "./employees.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";

@ApiTags("Nomina - Empleados")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("nomina/employees")
export class EmployeesController {
  constructor(private employeesService: EmployeesService) {}

  @Get()
  @Permissions("nomina:view")
  findAll(@CurrentUser() user: JwtPayload) {
    return this.employeesService.findAll(user.organizationId);
  }

  @Get("export")
  @Permissions("nomina:view")
  async exportEmployees(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const employees = await this.employeesService.findAll(user.organizationId);

    const header = [
      "Numero",
      "Nombre",
      "Apellido",
      "RFC",
      "CURP",
      "NSS",
      "Puesto",
      "Departamento",
      "Salario Diario",
      "Frecuencia Pago",
      "CLABE",
      "Fecha Contratacion",
      "Activo",
    ].join(";");

    const rows = employees.map((e) =>
      [
        e.employeeNumber,
        e.firstName,
        e.lastName,
        e.rfc || "",
        e.curp || "",
        e.nss || "",
        e.jobPosition,
        e.department || "",
        Number(e.dailySalary).toFixed(2),
        e.paymentFrequency || "",
        e.clabe || "",
        e.hireDate ? new Date(e.hireDate).toISOString().split("T")[0] : "",
        e.isActive ? "Si" : "No",
      ].join(";"),
    );

    const csv = [header, ...rows].join("\n");
    const filename = `Empleados_${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  }

  @Get(":id")
  @Permissions("nomina:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.employeesService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions("nomina:create")
  create(@CurrentUser() user: JwtPayload, @Body() body: CreateEmployeeDto) {
    return this.employeesService.create(user.organizationId, body);
  }

  @Patch(":id")
  @Permissions("nomina:update")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(user.organizationId, id, body);
  }

  @Patch(":id/terminate")
  @Permissions("nomina:update")
  terminate(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: { terminationDate: string },
  ) {
    return this.employeesService.terminate(user.organizationId, id, body.terminationDate);
  }
}
