import { IsString } from "class-validator";

export class RefreshDto {
  @IsString({ message: "refreshToken requerido" })
  refreshToken: string;
}
