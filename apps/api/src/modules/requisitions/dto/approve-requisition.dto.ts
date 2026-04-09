import {
  IsOptional,
  IsArray,
  ValidateNested,
  IsString,
  IsNumber,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

class ApprovedItemDto {
  @IsString()
  itemId: string;

  @IsNumber()
  @Min(0)
  approvedQuantity: number;
}

export class ApproveRequisitionDto {
  @IsOptional()
  @IsString()
  fulfillingBranchId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovedItemDto)
  items?: ApprovedItemDto[];
}

export class RejectRequisitionDto {
  @IsString()
  rejectionReason: string;
}
