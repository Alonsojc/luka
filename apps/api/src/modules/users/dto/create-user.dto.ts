import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsIn,
} from "class-validator";

export class CreateUserDto {
  @IsEmail({}, { message: "Email invalido" })
  email: string;

  @IsString()
  @MinLength(8, { message: "La contrasena debe tener al menos 8 caracteres" })
  password: string;

  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @IsIn(
    [
      "OWNER",
      "ADMIN",
      "MANAGER",
      "ACCOUNTANT",
      "CASHIER",
      "VIEWER",
      "owner",
      "admin",
      "manager",
      "accountant",
      "cashier",
      "viewer",
    ],
    { message: "Rol invalido" },
  )
  role: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
