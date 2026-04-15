import { IsString, IsOptional, IsNumber, IsIn, Min } from "class-validator";

export class UpdateLotDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @IsIn(["ACTIVE", "LOW", "EXPIRED", "CONSUMED", "DISPOSED"])
  status?: string;
}
