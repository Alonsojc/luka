import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsIn,
  Min,
} from "class-validator";
import { IsCLABE } from "../../../common/validators/mexican-validators";

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  jobPosition?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsNumber({}, { message: "El salario diario debe ser un numero" })
  @Min(0, { message: "El salario diario no puede ser negativo" })
  dailySalary?: number;

  @IsOptional()
  @IsNumber()
  integratedDailySalary?: number;

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
  @IsNumber()
  riskClass?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString({}, { message: "Fecha de terminacion invalida" })
  terminationDate?: string;
}
