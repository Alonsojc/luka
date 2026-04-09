import { IsString, IsOptional, IsBoolean, IsInt, IsIn, Min } from "class-validator";

export class CreateDeliveryConfigDto {
  @IsString()
  @IsIn(["UBEREATS", "RAPPI", "DIDI_FOOD"])
  platform: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  syncInterval?: number;
}
