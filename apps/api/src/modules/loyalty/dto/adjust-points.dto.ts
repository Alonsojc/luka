import { IsString, IsNumber, IsOptional } from "class-validator";

export class AdjustPointsDto {
  @IsString()
  customerId: string;

  @IsNumber()
  points: number;

  @IsOptional()
  @IsString()
  description?: string;
}
