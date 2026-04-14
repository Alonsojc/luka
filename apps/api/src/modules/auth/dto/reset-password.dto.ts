import { IsString } from "class-validator";
import { IsStrongPassword } from "../../../common/validators/strong-password.validator";

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @IsStrongPassword()
  password: string;
}
