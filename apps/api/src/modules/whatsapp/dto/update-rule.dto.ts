import { IsString, IsOptional, IsBoolean, IsIn, IsObject, IsArray } from "class-validator";

export class UpdateAlertRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    "STOCK_LOW",
    "LOT_EXPIRING",
    "REQUISITION_NEW",
    "REQUISITION_APPROVED",
    "DELIVERY_NEW",
    "DAILY_SUMMARY",
    "OPERATIONAL_RECONCILIATION",
  ])
  eventType?: string;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, any>;

  @IsOptional()
  @IsArray()
  recipients?: Array<{ phone: string; name: string; role?: string }>;

  @IsOptional()
  @IsString()
  messageTemplate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
