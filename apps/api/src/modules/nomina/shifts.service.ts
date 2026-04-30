import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@luka/database";
import { PrismaService } from "../../common/prisma/prisma.service";

type ShiftAssignmentWithDetails = Prisma.ShiftAssignmentGetPayload<{
  include: {
    employee: { select: { id: true; firstName: true; lastName: true } };
    shiftTemplate: {
      select: { id: true; name: true; startTime: true; endTime: true; color: true };
    };
  };
}>;

@Injectable()
export class ShiftsService {
  constructor(private prisma: PrismaService) {}

  // ── Shift Templates ──

  async findAllTemplates(organizationId: string) {
    return this.prisma.shiftTemplate.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async createTemplate(
    organizationId: string,
    data: {
      name: string;
      startTime: string;
      endTime: string;
      breakMinutes?: number;
      color?: string;
    },
  ) {
    return this.prisma.shiftTemplate.create({
      data: {
        organizationId,
        name: data.name,
        startTime: data.startTime,
        endTime: data.endTime,
        ...(data.breakMinutes !== undefined && {
          breakMinutes: data.breakMinutes,
        }),
        ...(data.color && { color: data.color }),
      },
    });
  }

  async updateTemplate(
    organizationId: string,
    id: string,
    data: {
      name?: string;
      startTime?: string;
      endTime?: string;
      breakMinutes?: number;
      color?: string;
    },
  ) {
    const template = await this.prisma.shiftTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!template) {
      throw new NotFoundException("Plantilla de turno no encontrada");
    }
    return this.prisma.shiftTemplate.update({
      where: { id },
      data,
    });
  }

  async deleteTemplate(organizationId: string, id: string) {
    const template = await this.prisma.shiftTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!template) {
      throw new NotFoundException("Plantilla de turno no encontrada");
    }
    return this.prisma.shiftTemplate.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ── Shift Assignments ──

  async getWeekSchedule(organizationId: string, branchId: string, weekStart: Date) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    return this.prisma.shiftAssignment.findMany({
      where: {
        organizationId,
        branchId,
        date: {
          gte: weekStart,
          lt: weekEnd,
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
        shiftTemplate: {
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
            breakMinutes: true,
            color: true,
          },
        },
      },
      orderBy: [{ employee: { lastName: "asc" } }, { date: "asc" }],
    });
  }

  async assignShift(
    organizationId: string,
    data: {
      employeeId: string;
      branchId: string;
      shiftTemplateId: string;
      date: string;
    },
  ) {
    return this.prisma.shiftAssignment.create({
      data: {
        organizationId,
        employeeId: data.employeeId,
        branchId: data.branchId,
        shiftTemplateId: data.shiftTemplateId,
        date: new Date(data.date),
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        shiftTemplate: {
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
            color: true,
          },
        },
      },
    });
  }

  async bulkAssign(
    organizationId: string,
    data: {
      employeeId: string;
      branchId: string;
      shiftTemplateId: string;
      dates: string[];
    },
  ) {
    const results: ShiftAssignmentWithDetails[] = [];
    for (const dateStr of data.dates) {
      try {
        const assignment = await this.prisma.shiftAssignment.upsert({
          where: {
            employeeId_date: {
              employeeId: data.employeeId,
              date: new Date(dateStr),
            },
          },
          update: {
            shiftTemplateId: data.shiftTemplateId,
            branchId: data.branchId,
          },
          create: {
            organizationId,
            employeeId: data.employeeId,
            branchId: data.branchId,
            shiftTemplateId: data.shiftTemplateId,
            date: new Date(dateStr),
          },
          include: {
            employee: {
              select: { id: true, firstName: true, lastName: true },
            },
            shiftTemplate: {
              select: {
                id: true,
                name: true,
                startTime: true,
                endTime: true,
                color: true,
              },
            },
          },
        });
        results.push(assignment);
      } catch {
        // Skip duplicate assignments silently
      }
    }
    return results;
  }

  async removeAssignment(organizationId: string, id: string) {
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: { id, organizationId },
    });
    if (!assignment) {
      throw new NotFoundException("Asignacion de turno no encontrada");
    }
    return this.prisma.shiftAssignment.delete({
      where: { id },
    });
  }

  async getEmployeeSchedule(
    organizationId: string,
    employeeId: string,
    month: number,
    year: number,
  ) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    return this.prisma.shiftAssignment.findMany({
      where: {
        organizationId,
        employeeId,
        date: {
          gte: startDate,
          lt: endDate,
        },
      },
      include: {
        shiftTemplate: {
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
            breakMinutes: true,
            color: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: { date: "asc" },
    });
  }

  async getWeekSummary(organizationId: string, branchId: string, weekStart: Date) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const assignments = await this.prisma.shiftAssignment.findMany({
      where: {
        organizationId,
        branchId,
        date: {
          gte: weekStart,
          lt: weekEnd,
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNumber: true,
          },
        },
        shiftTemplate: {
          select: {
            startTime: true,
            endTime: true,
            breakMinutes: true,
          },
        },
      },
    });

    // Calculate hours per employee
    const summaryMap = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        employeeNumber: string;
        totalHours: number;
        totalBreakMinutes: number;
        shifts: number;
      }
    >();

    for (const a of assignments) {
      const key = a.employeeId;
      const existing = summaryMap.get(key);

      const [startH, startM] = a.shiftTemplate.startTime.split(":").map(Number);
      const [endH, endM] = a.shiftTemplate.endTime.split(":").map(Number);
      let hours = endH - startH + (endM - startM) / 60;
      if (hours < 0) hours += 24; // overnight shift
      const netHours = hours - a.shiftTemplate.breakMinutes / 60;

      if (existing) {
        existing.totalHours += netHours;
        existing.totalBreakMinutes += a.shiftTemplate.breakMinutes;
        existing.shifts += 1;
      } else {
        summaryMap.set(key, {
          employeeId: a.employee.id,
          employeeName: `${a.employee.firstName} ${a.employee.lastName}`,
          employeeNumber: a.employee.employeeNumber,
          totalHours: netHours,
          totalBreakMinutes: a.shiftTemplate.breakMinutes,
          shifts: 1,
        });
      }
    }

    return Array.from(summaryMap.values()).sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName),
    );
  }
}
