import { IsArray, ValidateNested, IsString, IsNumber, Min, ArrayMinSize } from "class-validator";
import { Type } from "class-transformer";

class ReceiveItemDto {
  @IsString()
  itemId: string;

  @IsNumber()
  @Min(0)
  receivedQuantity: number;
}

export class ReceiveTransferDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items: ReceiveItemDto[];
}
