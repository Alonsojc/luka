import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  Min,
} from "class-validator";

export class CreateLotDto {
  @IsString()
  productId: string;

  @IsString()
  branchId: string;

  @IsOptional()
  @IsString()
  lotNumber?: string;

  @IsOptional()
  @IsDateString()
  batchDate?: string;

  @IsDateString()
  expirationDate: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
