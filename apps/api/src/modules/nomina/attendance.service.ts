import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { Prisma } from "@prisma/client";
const Decimal = Prisma.Decimal;

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get today's date at midnight in Mexico City timezone (UTC-6).
   */
  private getTodayDate(): Date {
    const now = new Date();
    const mx = new Date(now.toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
    mx.setHours(0, 0, 0, 0);
    return mx;
  }

  /**
   * Get current time as "HH:MM" in Mexico City timezone.
   */
  private getMexicoTimeString(): string {
    return new Date().toLocaleTimeString("en-GB", {
      timeZone: "America/Mexico_City",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /**
   * Calculate minutes difference between two "HH:MM" time strings.
   * Returns positive if actual is after scheduled.
   */
  private minutesDiff(actual: string, scheduled: string): number {
    const [aH, aM] = actual.split(":").map(Number);
    const [sH, sM] = scheduled.split(":").map(Number);
    return aH * 60 + aM - (sH * 60 + sM);
  }

  /**
   * Clock in: create an AttendanceRecord for today.
   */
  async clockIn(orgId: string, employeeId: string, branchId: string) {
    const today = this.getTodayDate();
    const now = new Date();

    // Check for existing record
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (existing && existing.clockIn) {
      throw new ConflictException("El empleado ya registró entrada hoy");
    }

    // Look up scheduled shift for today
    const shift = await this.prisma.shiftAssignment.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
      include: { shiftTemplate: true },
    });

    const scheduledIn = shift?.shiftTemplate?.startTime || null;
    const scheduledOut = shift?.shiftTemplate?.endTime || null;

    // Calculate late minutes
    let lateMinutes = 0;
    let status = "PRESENT";
    if (scheduledIn) {
      const currentTime = this.getMexicoTimeString();
      const diff = this.minutesDiff(currentTime, scheduledIn);
      if (diff > 5) {
        // 5-minute grace period
        lateMinutes = diff;
        status = "LATE";
      }
    }

    if (existing) {
      // Update existing record (e.g., was created as ABSENT and now clocking in)
      return this.prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          clockIn: now,
          scheduledIn,
          scheduledOut,
          lateMinutes,
          status,
          source: "MANUAL",
        },
        include: { employee: true },
      });
    }

    return this.prisma.attendanceRecord.create({
      data: {
        organizationId: orgId,
        employeeId,
        branchId,
        date: today,
        clockIn: now,
        scheduledIn,
        scheduledOut,
        lateMinutes,
        status,
        source: "MANUAL",
      },
      include: { employee: true },
    });
  }

  /**
   * Clock out: update today's record with clockOut and calculated fields.
   */
  async clockOut(orgId: string, employeeId: string) {
    const today = this.getTodayDate();
    const now = new Date();

    const record = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (!record) {
      throw new NotFoundException("No se encontró registro de entrada para hoy");
    }
    if (!record.clockIn) {
      throw new ConflictException("El empleado no ha registrado entrada hoy");
    }
    if (record.clockOut) {
      throw new ConflictException("El empleado ya registró salida hoy");
    }

    // Calculate worked hours
    const diffMs = now.getTime() - record.clockIn.getTime();
    const workedHours = new Decimal((diffMs / 3600000).toFixed(2));

    // Calculate early leave / overtime
    let earlyLeaveMin = 0;
    let overtimeMin = 0;
    if (record.scheduledOut) {
      const currentTime = this.getMexicoTimeString();
      const diff = this.minutesDiff(currentTime, record.scheduledOut);
      if (diff < -5) {
        earlyLeaveMin = Math.abs(diff);
      } else if (diff > 0) {
        overtimeMin = diff;
      }
    }

    return this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        clockOut: now,
        workedHours,
        earlyLeaveMin,
        overtimeMin,
      },
      include: { employee: true },
    });
  }

  /**
   * Get today's attendance for a branch, including employees without records.
   */
  async getToday(orgId: string, branchId: string) {
    const today = this.getTodayDate();

    const employees = await this.prisma.employee.findMany({
      where: { organizationId: orgId, branchId, isActive: true },
      orderBy: { lastName: "asc" },
    });

    const records = await this.prisma.attendanceRecord.findMany({
      where: { organizationId: orgId, branchId, date: today },
    });

    const shifts = await this.prisma.shiftAssignment.findMany({
      where: { branchId, date: today },
      include: { shiftTemplate: true },
    });

    const recordMap = new Map(records.map((r) => [r.employeeId, r]));
    const shiftMap = new Map(shifts.map((s) => [s.employeeId, s]));

    const result = employees.map((emp) => {
      const record = recordMap.get(emp.id);
      const shift = shiftMap.get(emp.id);
      return {
        employee: emp,
        record: record || null,
        shift: shift
          ? {
              startTime: shift.shiftTemplate.startTime,
              endTime: shift.shiftTemplate.endTime,
              shiftName: shift.shiftTemplate.name,
            }
          : null,
      };
    });

    // Summary counts
    const present = result.filter((r) => r.record?.status === "PRESENT").length;
    const late = result.filter((r) => r.record?.status === "LATE").length;
    const absent = result.filter((r) => r.record?.status === "ABSENT").length;
    const notYet = result.filter((r) => !r.record).length;
    const holiday = result.filter((r) => r.record?.status === "HOLIDAY").length;

    return {
      date: today,
      summary: { present, late, absent, notYet, holiday, total: employees.length },
      employees: result,
    };
  }

  /**
   * Get attendance records for a date range.
   */
  async getByDateRange(orgId: string, branchId: string, startDate: string, endDate: string) {
    return this.prisma.attendanceRecord.findMany({
      where: {
        organizationId: orgId,
        branchId,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobPosition: true,
            employeeNumber: true,
          },
        },
      },
      orderBy: [{ date: "desc" }, { employee: { lastName: "asc" } }],
    });
  }

  /**
   * Mark an employee as absent for a date.
   */
  async markAbsent(orgId: string, employeeId: string, date: string) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId: orgId },
    });
    if (!employee) {
      throw new NotFoundException("Empleado no encontrado");
    }

    return this.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId, date: d } },
      update: { status: "ABSENT", clockIn: null, clockOut: null, workedHours: null },
      create: {
        organizationId: orgId,
        employeeId,
        branchId: employee.branchId,
        date: d,
        status: "ABSENT",
        source: "MANUAL",
      },
      include: { employee: true },
    });
  }

  /**
   * Mark all employees at a branch as HOLIDAY for a date.
   */
  async markHoliday(orgId: string, branchId: string, date: string) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    const employees = await this.prisma.employee.findMany({
      where: { organizationId: orgId, branchId, isActive: true },
    });

    const results = [];
    for (const emp of employees) {
      const record = await this.prisma.attendanceRecord.upsert({
        where: { employeeId_date: { employeeId: emp.id, date: d } },
        update: { status: "HOLIDAY" },
        create: {
          organizationId: orgId,
          employeeId: emp.id,
          branchId,
          date: d,
          status: "HOLIDAY",
          source: "MANUAL",
        },
      });
      results.push(record);
    }

    return { count: results.length, date: d };
  }

  /**
   * Edit a record (manual correction).
   */
  async editRecord(
    orgId: string,
    id: string,
    data: {
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
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!record) {
      throw new NotFoundException("Registro no encontrado");
    }

    const updateData: any = {};
    if (data.clockIn !== undefined) updateData.clockIn = new Date(data.clockIn);
    if (data.clockOut !== undefined) updateData.clockOut = new Date(data.clockOut);
    if (data.status !== undefined) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.lateMinutes !== undefined) updateData.lateMinutes = data.lateMinutes;
    if (data.earlyLeaveMin !== undefined) updateData.earlyLeaveMin = data.earlyLeaveMin;
    if (data.overtimeMin !== undefined) updateData.overtimeMin = data.overtimeMin;
    if (data.workedHours !== undefined)
      updateData.workedHours = new Decimal(data.workedHours.toFixed(2));

    // Recalculate workedHours if clockIn and clockOut are both set
    const finalClockIn = updateData.clockIn || record.clockIn;
    const finalClockOut = updateData.clockOut || record.clockOut;
    if (finalClockIn && finalClockOut && data.workedHours === undefined) {
      const diffMs = finalClockOut.getTime() - finalClockIn.getTime();
      updateData.workedHours = new Decimal((diffMs / 3600000).toFixed(2));
    }

    return this.prisma.attendanceRecord.update({
      where: { id },
      data: updateData,
      include: { employee: true },
    });
  }

  /**
   * Monthly attendance for a single employee.
   */
  async getEmployeeAttendance(orgId: string, employeeId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of month

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId: orgId },
    });
    if (!employee) {
      throw new NotFoundException("Empleado no encontrado");
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        employeeId,
        organizationId: orgId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: "asc" },
    });

    const present = records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
    const late = records.filter((r) => r.status === "LATE").length;
    const absent = records.filter((r) => r.status === "ABSENT").length;
    const holidays = records.filter((r) => r.status === "HOLIDAY").length;
    const totalWorkedHours = records.reduce((sum, r) => sum + Number(r.workedHours || 0), 0);
    const totalOvertimeMin = records.reduce((sum, r) => sum + r.overtimeMin, 0);

    return {
      employee,
      month,
      year,
      records,
      summary: {
        present,
        late,
        absent,
        holidays,
        totalWorkedHours: Number(totalWorkedHours.toFixed(2)),
        totalOvertimeMin,
        totalDays: records.length,
      },
    };
  }

  /**
   * Branch monthly summary: per-employee stats.
   */
  async getBranchSummary(orgId: string, branchId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const employees = await this.prisma.employee.findMany({
      where: { organizationId: orgId, branchId, isActive: true },
      orderBy: { lastName: "asc" },
    });

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        organizationId: orgId,
        branchId,
        date: { gte: startDate, lte: endDate },
      },
    });

    const byEmployee = new Map<string, typeof records>();
    for (const r of records) {
      if (!byEmployee.has(r.employeeId)) {
        byEmployee.set(r.employeeId, []);
      }
      byEmployee.get(r.employeeId)!.push(r);
    }

    const employeeSummaries = employees.map((emp) => {
      const empRecords = byEmployee.get(emp.id) || [];
      const present = empRecords.filter(
        (r) => r.status === "PRESENT" || r.status === "LATE",
      ).length;
      const late = empRecords.filter((r) => r.status === "LATE").length;
      const absent = empRecords.filter((r) => r.status === "ABSENT").length;
      const totalHours = empRecords.reduce((sum, r) => sum + Number(r.workedHours || 0), 0);
      const totalOvertimeMin = empRecords.reduce((sum, r) => sum + r.overtimeMin, 0);
      const avgHours = present > 0 ? totalHours / present : 0;

      return {
        employee: emp,
        present,
        late,
        absent,
        totalHours: Number(totalHours.toFixed(2)),
        avgHours: Number(avgHours.toFixed(2)),
        totalOvertimeMin,
        totalDays: empRecords.length,
      };
    });

    // Branch-wide totals
    const totalPresent = employeeSummaries.reduce((s, e) => s + e.present, 0);
    const totalLate = employeeSummaries.reduce((s, e) => s + e.late, 0);
    const totalAbsent = employeeSummaries.reduce((s, e) => s + e.absent, 0);
    const totalHours = employeeSummaries.reduce((s, e) => s + e.totalHours, 0);

    return {
      month,
      year,
      branchId,
      branchSummary: {
        totalPresent,
        totalLate,
        totalAbsent,
        totalHours: Number(totalHours.toFixed(2)),
        avgPunctuality:
          totalPresent + totalLate > 0
            ? Number((((totalPresent - totalLate) / (totalPresent + totalLate)) * 100).toFixed(1))
            : 0,
        absenteeismRate:
          totalPresent + totalLate + totalAbsent > 0
            ? Number(((totalAbsent / (totalPresent + totalLate + totalAbsent)) * 100).toFixed(1))
            : 0,
      },
      employees: employeeSummaries,
    };
  }

  /**
   * Detailed attendance report for a date range.
   */
  async getAttendanceReport(orgId: string, branchId: string, startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const employees = await this.prisma.employee.findMany({
      where: { organizationId: orgId, branchId, isActive: true },
      orderBy: { lastName: "asc" },
    });

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        organizationId: orgId,
        branchId,
        date: { gte: start, lte: end },
      },
    });

    const byEmployee = new Map<string, typeof records>();
    for (const r of records) {
      if (!byEmployee.has(r.employeeId)) {
        byEmployee.set(r.employeeId, []);
      }
      byEmployee.get(r.employeeId)!.push(r);
    }

    const report = employees.map((emp) => {
      const empRecords = byEmployee.get(emp.id) || [];
      const present = empRecords.filter(
        (r) => r.status === "PRESENT" || r.status === "LATE",
      ).length;
      const late = empRecords.filter((r) => r.status === "LATE").length;
      const absent = empRecords.filter((r) => r.status === "ABSENT").length;
      const totalOvertimeMin = empRecords.reduce((sum, r) => sum + r.overtimeMin, 0);
      const totalHours = empRecords.reduce((sum, r) => sum + Number(r.workedHours || 0), 0);

      // Calculate average arrival time
      const clockIns = empRecords
        .filter((r) => r.clockIn)
        .map((r) => {
          const d = new Date(r.clockIn!);
          return d.getHours() * 60 + d.getMinutes();
        });
      const avgArrivalMin =
        clockIns.length > 0 ? clockIns.reduce((s, m) => s + m, 0) / clockIns.length : 0;
      const avgArrivalHour = Math.floor(avgArrivalMin / 60);
      const avgArrivalMinute = Math.round(avgArrivalMin % 60);
      const avgArrival =
        clockIns.length > 0
          ? `${String(avgArrivalHour).padStart(2, "0")}:${String(avgArrivalMinute).padStart(2, "0")}`
          : "—";

      const punctuality =
        present + late > 0 ? Number((((present - late) / (present + late)) * 100).toFixed(1)) : 0;

      return {
        employee: emp,
        totalDays: empRecords.length,
        present,
        late,
        absent,
        overtimeHours: Number((totalOvertimeMin / 60).toFixed(1)),
        totalHours: Number(totalHours.toFixed(2)),
        avgArrival,
        punctuality,
      };
    });

    return { startDate: start, endDate: end, branchId, report };
  }
}
