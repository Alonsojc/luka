import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.employee.findMany({
      where: { organizationId },
      orderBy: { lastName: "asc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId },
      include: { user: { select: { email: true } } },
    });
    if (!employee) {
      throw new NotFoundException("Empleado no encontrado");
    }
    return employee;
  }

  async create(
    organizationId: string,
    data: {
      branchId: string;
      userId?: string;
      employeeNumber: string;
      firstName: string;
      lastName: string;
      curp?: string;
      rfc?: string;
      nss?: string;
      hireDate: string;
      contractType?: string;
      jobPosition: string;
      department?: string;
      dailySalary: number;
      paymentFrequency?: string;
      bankAccount?: string;
      clabe?: string;
      employerRegistrationNumber?: string;
      riskClass?: number;
    },
  ) {
    const { hireDate, contractType, paymentFrequency, ...rest } = data;
    return this.prisma.employee.create({
      data: {
        organizationId,
        ...rest,
        hireDate: new Date(hireDate),
        ...(contractType && { contractType: contractType as any }),
        ...(paymentFrequency && { paymentFrequency: paymentFrequency as any }),
      },
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: {
      branchId?: string;
      jobPosition?: string;
      department?: string;
      dailySalary?: number;
      integratedDailySalary?: number;
      paymentFrequency?: string;
      bankAccount?: string;
      clabe?: string;
      riskClass?: number;
      isActive?: boolean;
      terminationDate?: string;
    },
  ) {
    await this.findOne(organizationId, id);
    const { terminationDate, paymentFrequency, ...rest } = data;
    return this.prisma.employee.update({
      where: { id },
      data: {
        ...rest,
        ...(terminationDate && { terminationDate: new Date(terminationDate) }),
        ...(paymentFrequency && { paymentFrequency: paymentFrequency as any }),
      },
    });
  }

  async terminate(organizationId: string, id: string, terminationDate: string) {
    await this.findOne(organizationId, id);
    return this.prisma.employee.update({
      where: { id },
      data: {
        isActive: false,
        terminationDate: new Date(terminationDate),
      },
    });
  }
}
