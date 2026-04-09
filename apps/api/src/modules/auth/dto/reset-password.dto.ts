import { IsString, MinLength } from "class-validator";

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8, { message: "La contrasena debe tener al menos 8 caracteres" })
  password: string;
}
