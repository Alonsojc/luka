import { IsEmail, IsString, IsOptional, IsBoolean, IsIn } from "class-validator";

export class UpdateUserDto {
  @IsOptional()
  @IsEmail({}, { message: "Email invalido" })
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
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
  role?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
