import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  ArrayMinSize,
  IsDateString,
  IsIn,
} from "class-validator";
import { Type } from "class-transformer";

class RequisitionItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(0.0001)
  requestedQuantity: number;

  @IsString()
  unitOfMeasure: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateRequisitionDto {
  @IsString()
  requestingBranchId: string;

  @IsOptional()
  @IsString()
  fulfillingBranchId?: string;

  @IsOptional()
  @IsIn(["LOW", "NORMAL", "HIGH", "URGENT"])
  priority?: string;

  @IsOptional()
  @IsDateString()
  requestedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(["DRAFT", "SUBMITTED"])
  status?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RequisitionItemDto)
  items: RequisitionItemDto[];
}

export class UpdateRequisitionDto {
  @IsOptional()
  @IsIn(["LOW", "NORMAL", "HIGH", "URGENT"])
  priority?: string;

  @IsOptional()
  @IsDateString()
  requestedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequisitionItemDto)
  items?: RequisitionItemDto[];
}
