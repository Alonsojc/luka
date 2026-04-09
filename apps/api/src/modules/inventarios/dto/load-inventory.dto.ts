import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  ArrayMinSize,
} from "class-validator";
import { Type } from "class-transformer";

class LoadInventoryItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class LoadInventoryDto {
  @IsString()
  branchId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LoadInventoryItemDto)
  items: LoadInventoryItemDto[];
}

class CsvRowDto {
  @IsString()
  sku: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class LoadCsvDto {
  @IsString()
  branchId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CsvRowDto)
  rows: CsvRowDto[];
}

export class AdjustInventoryDto {
  @IsString()
  branchId: string;

  @IsString()
  productId: string;

  @IsNumber()
  @Min(0)
  newQuantity: number;

  @IsString()
  reason: string;
}
