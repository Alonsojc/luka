import { IsString, IsOptional, IsBoolean, IsIn, IsObject, IsArray } from "class-validator";

export class CreateAlertRuleDto {
  @IsString()
  name: string;

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
  eventType: string;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, any>;

  @IsArray()
  recipients: Array<{ phone: string; name: string; role?: string }>;

  @IsString()
  messageTemplate: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
