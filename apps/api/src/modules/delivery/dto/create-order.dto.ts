import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsArray,
  ValidateNested,
  IsIn,
} from "class-validator";
import { Type } from "class-transformer";

class OrderItemDto {
  @IsString()
  name: string;

  @IsNumber()
  qty: number;

  @IsNumber()
  unitPrice: number;
}

export class CreateDeliveryOrderDto {
  @IsString()
  @IsIn(["UBEREATS", "RAPPI", "DIDI_FOOD", "MANUAL"])
  platform: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  externalOrderId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsNumber()
  subtotal: number;

  @IsOptional()
  @IsNumber()
  deliveryFee?: number;

  @IsOptional()
  @IsNumber()
  platformFee?: number;

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsNumber()
  total: number;

  @IsDateString()
  orderDate: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];
}
