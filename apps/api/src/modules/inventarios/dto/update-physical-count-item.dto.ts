import { IsNumber, IsOptional, IsString, IsArray, ValidateNested, Min } from "class-validator";
import { Type } from "class-transformer";

export class UpdatePhysicalCountItemDto {
  @IsNumber()
  @Min(0)
  countedQuantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

class BulkItemDto {
  @IsString()
  itemId: string;

  @IsNumber()
  @Min(0)
  countedQuantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkUpdatePhysicalCountItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkItemDto)
  items: BulkItemDto[];
}

export class CreatePhysicalCountDto {
  @IsString()
  branchId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
