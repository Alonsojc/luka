import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsIn,
} from "class-validator";
import { IsStrongPassword } from "../../../common/validators/strong-password.validator";

export class CreateUserDto {
  @IsEmail({}, { message: "Email invalido" })
  email: string;

  @IsString()
  @IsStrongPassword()
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
