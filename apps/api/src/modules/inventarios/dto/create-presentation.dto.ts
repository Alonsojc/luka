import { IsString, IsOptional, IsNumber, IsBoolean, Min, IsIn } from "class-validator";

export class CreatePresentationDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsNumber()
  @Min(0.000001)
  conversionFactor: number;

  @IsString()
  @IsIn(["kg", "g", "lt", "ml", "pza", "caja", "bolsa"])
  conversionUnit: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
