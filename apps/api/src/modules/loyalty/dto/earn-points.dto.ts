import { IsString, IsNumber, IsOptional, Min } from "class-validator";

export class EarnPointsDto {
  @IsString()
  customerId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
