import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
  MinLength,
  Min,
} from "class-validator";
import {
  IsRFC,
  IsCLABE,
  IsPhoneMX,
} from "../../../common/validators/mexican-validators";

export class CreateSupplierDto {
  @IsString()
  @MinLength(2, { message: "El nombre debe tener al menos 2 caracteres" })
  name: string;

  @IsOptional()
  @IsRFC()
  rfc?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail({}, { message: "Email invalido" })
  email?: string;

  @IsOptional()
  @IsPhoneMX()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber({}, { message: "Los dias de pago deben ser un numero" })
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsCLABE()
  clabe?: string;
}
