import { IsString, IsNumber, IsOptional, Min } from "class-validator";

export class RedeemPointsDto {
  @IsString()
  customerId: string;

  @IsOptional()
  @IsString()
  rewardId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  points?: number;

  @IsOptional()
  @IsString()
  branchId?: string;
}
