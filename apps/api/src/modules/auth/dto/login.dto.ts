import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "Email invalido" })
  email: string;

  @IsString()
  @MinLength(1, { message: "Contrasena requerida" })
  password: string;
}
