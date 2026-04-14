import { IsEmail, IsString, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { IsStrongPassword } from "../../../common/validators/strong-password.validator";

class FirstBranchDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  code: string;

  @IsString()
  @MinLength(1)
  city: string;

  @IsString()
  @MinLength(1)
  state: string;

  @IsString()
  @MinLength(1)
  address: string;

  @IsString()
  @MinLength(1)
  postalCode: string;
}

export class OnboardDto {
  @IsString()
  @MinLength(1)
  orgName: string;

  @IsString()
  @MinLength(12, { message: "RFC debe tener al menos 12 caracteres" })
  rfc: string;

  @IsString()
  @MinLength(1)
  razonSocial: string;

  @IsString()
  @MinLength(1)
  regimenFiscal: string;

  @IsEmail({}, { message: "Email del administrador invalido" })
  adminEmail: string;

  @IsString()
  @IsStrongPassword()
  adminPassword: string;

  @IsString()
  @MinLength(1)
  adminFirstName: string;

  @IsString()
  @MinLength(1)
  adminLastName: string;

  @ValidateNested()
  @Type(() => FirstBranchDto)
  firstBranch: FirstBranchDto;
}
