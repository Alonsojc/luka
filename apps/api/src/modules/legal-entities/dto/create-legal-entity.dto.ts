import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from "class-validator";

export class CreateLegalEntityDto {
  @IsString()
  @MinLength(1, { message: "El nombre es requerido" })
  name: string;

  @IsString()
  @Matches(/^[A-Z&]{3,4}\d{6}[A-Z0-9]{3}$/, {
    message: "RFC invalido. Formato esperado: 3-4 letras + 6 digitos + 3 caracteres",
  })
  rfc: string;

  @IsString()
  @MinLength(1, { message: "La razon social es requerida" })
  razonSocial: string;

  @IsString()
  @MinLength(1, { message: "El regimen fiscal es requerido" })
  @MaxLength(3)
  regimenFiscal: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  postalCode?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}
