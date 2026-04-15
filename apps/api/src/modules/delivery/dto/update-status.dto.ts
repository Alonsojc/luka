import { IsString, IsIn } from "class-validator";

export class UpdateDeliveryStatusDto {
  @IsString()
  @IsIn(["RECEIVED", "PREPARING", "READY", "PICKED_UP", "DELIVERED", "CANCELLED"])
  status: string;
}
