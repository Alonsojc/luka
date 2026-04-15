import { IsString, IsOptional, IsNumber, IsIn, Min, IsDateString } from "class-validator";

export class CreateMermaDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsString()
  @IsIn(["SPOILAGE", "OVER_PREP", "ACCIDENT", "EXPIRED", "OTHER"])
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsDateString()
  reportedAt?: string;
}
