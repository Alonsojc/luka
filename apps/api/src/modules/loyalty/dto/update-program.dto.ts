import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  Min,
} from "class-validator";

export class UpdateProgramDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  pointsPerDollar?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  pointValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  minRedemption?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  expirationDays?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  tiers?: Array<{ name: string; minPoints: number; multiplier: number }>;
}
