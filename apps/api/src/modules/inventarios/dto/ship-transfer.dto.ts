import { IsArray, ValidateNested, IsString, IsNumber, Min, ArrayMinSize } from "class-validator";
import { Type } from "class-transformer";

class ShipItemDto {
  @IsString()
  itemId: string;

  @IsNumber()
  @Min(0.0001)
  sentQuantity: number;
}

export class ShipTransferDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShipItemDto)
  items: ShipItemDto[];
}
