import { Module } from "@nestjs/common";
import { EmployeesController } from "./employees.controller";
import { EmployeesService } from "./employees.service";
import { PayrollController } from "./payroll.controller";
import { PayrollService } from "./payroll.service";
import { SuaController } from "./sua.controller";
import { SuaService } from "./sua.service";
import { NominaCfdiController } from "./nomina-cfdi.controller";
import { NominaCfdiService } from "./nomina-cfdi.service";
import { ShiftsController } from "./shifts.controller";
import { ShiftsService } from "./shifts.service";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { WorkyController } from "./worky.controller";
import { WorkyService } from "./worky.service";

@Module({
  controllers: [EmployeesController, PayrollController, SuaController, NominaCfdiController, ShiftsController, AttendanceController, WorkyController],
  providers: [EmployeesService, PayrollService, SuaService, NominaCfdiService, ShiftsService, AttendanceService, WorkyService],
  exports: [EmployeesService, PayrollService, SuaService, NominaCfdiService, ShiftsService, AttendanceService, WorkyService],
})
export class NominaModule {}
