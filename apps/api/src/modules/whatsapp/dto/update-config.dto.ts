import { IsString, IsOptional, IsBoolean, IsIn } from "class-validator";

export class UpdateWhatsAppConfigDto {
  @IsOptional()
  @IsString()
  @IsIn(["twilio", "meta", "mock"])
  provider?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  apiSecret?: string;

  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
