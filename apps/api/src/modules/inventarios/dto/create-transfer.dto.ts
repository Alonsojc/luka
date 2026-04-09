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

class TransferItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(0.0001)
  requestedQuantity: number;
}

export class CreateTransferDto {
  @IsString()
  fromBranchId: string;

  @IsString()
  toBranchId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items: TransferItemDto[];
}
