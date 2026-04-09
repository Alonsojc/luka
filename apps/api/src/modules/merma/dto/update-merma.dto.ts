import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  Min,
  IsDateString,
} from "class-validator";

export class UpdateMermaDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  @IsIn(["SPOILAGE", "OVER_PREP", "ACCIDENT", "EXPIRED", "OTHER"])
  reason?: string;

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
