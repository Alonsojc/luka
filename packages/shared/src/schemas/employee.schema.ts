import { z } from "zod";

export const createEmployeeSchema = z.object({
  branchId: z.string(),
  employeeNumber: z.string().min(1, "Número de empleado requerido"),
  firstName: z.string().min(2, "Nombre requerido"),
  lastName: z.string().min(2, "Apellido requerido"),
  curp: z
    .string()
    .length(18, "CURP debe ser de 18 caracteres")
    .regex(/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/, "Formato de CURP inválido")
    .optional(),
  rfc: z.string().min(12).max(13).optional(),
  nss: z
    .string()
    .length(11, "NSS debe ser de 11 dígitos")
    .regex(/^\d{11}$/, "Solo dígitos")
    .optional(),
  hireDate: z.string().or(z.date()),
  contractType: z.enum(["PERMANENT", "TEMPORARY", "SEASONAL"]),
  jobPosition: z.string().min(2, "Puesto requerido"),
  department: z.string().optional(),
  dailySalary: z.number().positive("Salario debe ser positivo"),
  paymentFrequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
  bankAccount: z.string().optional(),
  clabe: z
    .string()
    .length(18, "CLABE debe ser de 18 dígitos")
    .regex(/^\d{18}$/, "Solo dígitos")
    .optional(),
  riskClass: z.number().int().min(1).max(5).default(1),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
