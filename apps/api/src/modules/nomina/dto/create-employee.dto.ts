import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
  IsDateString,
  IsIn,
  MinLength,
  MaxLength,
  Min,
} from "class-validator";
import { IsRFC, IsCURP, IsNSS, IsCLABE } from "../../../common/validators/mexican-validators";

export class CreateEmployeeDto {
  @IsString()
  branchId: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  employeeNumber: string;

  @IsString()
  @MinLength(2, { message: "El nombre debe tener al menos 2 caracteres" })
  @MaxLength(100, { message: "El nombre no debe exceder 100 caracteres" })
  firstName: string;

  @IsString()
  @MinLength(2, { message: "El apellido debe tener al menos 2 caracteres" })
  @MaxLength(100, { message: "El apellido no debe exceder 100 caracteres" })
  lastName: string;

  @IsOptional()
  @IsCURP()
  curp?: string;

  @IsOptional()
  @IsRFC()
  rfc?: string;

  @IsOptional()
  @IsNSS()
  nss?: string;

  @IsDateString({}, { message: "Fecha de contratacion invalida" })
  hireDate: string;

  @IsOptional()
  @IsIn(["INDEFINIDO", "TEMPORAL", "OBRA_DETERMINADA", "CAPACITACION"], {
    message: "Tipo de contrato invalido",
  })
  contractType?: string;

  @IsString()
  jobPosition: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsNumber({}, { message: "El salario diario debe ser un numero" })
  @Min(0, { message: "El salario diario no puede ser negativo" })
  dailySalary: number;

  @IsOptional()
  @IsIn(["SEMANAL", "QUINCENAL", "MENSUAL"], {
    message: "Frecuencia de pago invalida",
  })
  paymentFrequency?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsCLABE()
  clabe?: string;

  @IsOptional()
  @IsEmail({}, { message: "Email invalido" })
  email?: string;

  @IsOptional()
  @IsString()
  employerRegistrationNumber?: string;

  @IsOptional()
  @IsNumber()
  riskClass?: number;
}
