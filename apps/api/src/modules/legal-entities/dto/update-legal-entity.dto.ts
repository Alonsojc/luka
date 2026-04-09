import {
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
  Matches,
} from "class-validator";

export class UpdateLegalEntityDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z&]{3,4}\d{6}[A-Z0-9]{3}$/, {
    message: "RFC invalido. Formato esperado: 3-4 letras + 6 digitos + 3 caracteres",
  })
  rfc?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  razonSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  regimenFiscal?: string;

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
