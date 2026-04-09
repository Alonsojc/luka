import {
  IsString,
  IsOptional,
  IsEmail,
  IsIn,
  MinLength,
  Matches,
} from "class-validator";
import {
  IsPhoneMX,
  IsPostalCodeMX,
} from "../../../common/validators/mexican-validators";

export class CreateBranchDto {
  @IsString()
  @MinLength(2, { message: "El nombre debe tener al menos 2 caracteres" })
  name: string;

  @IsString()
  @Matches(/^[A-Z0-9]+$/, {
    message: "El codigo solo puede contener letras mayusculas y numeros",
  })
  code: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  address: string;

  @IsString()
  @IsPostalCodeMX()
  postalCode: string;

  @IsOptional()
  @IsPhoneMX()
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: "Email invalido" })
  email?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsIn(["CEDIS", "ALMACEN", "TIENDA"], {
    message: "Tipo de sucursal invalido",
  })
  branchType?: string;

  @IsOptional()
  @IsString()
  corntechBranchId?: string;

  @IsOptional()
  @IsString()
  legalEntityId?: string;
}
