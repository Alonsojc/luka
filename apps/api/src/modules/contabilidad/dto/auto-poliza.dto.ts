import { IsEnum, IsString, IsOptional, IsArray } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum AutoPolizaType {
  PURCHASE = "purchase",
  SALE = "sale",
  PAYROLL = "payroll",
  PAYMENT = "payment",
  BANK_TRANSACTION = "bank_transaction",
}

export enum SaleSourceType {
  POS = "pos",
  CORNTECH = "corntech",
}

export class GenerateAutoPolizaDto {
  @ApiProperty({
    enum: AutoPolizaType,
    description: "Tipo de evento de negocio",
  })
  @IsEnum(AutoPolizaType)
  type: AutoPolizaType;

  @ApiProperty({ description: "ID del registro de referencia" })
  @IsString()
  referenceId: string;

  @ApiPropertyOptional({
    enum: SaleSourceType,
    description: "Fuente de la venta (solo para type=sale)",
  })
  @IsOptional()
  @IsEnum(SaleSourceType)
  saleSource?: SaleSourceType;
}

export class GenerateBatchAutoPolizaDto {
  @ApiPropertyOptional({
    enum: AutoPolizaType,
    isArray: true,
    description:
      "Tipos de evento a procesar. Si se omite, procesa todos los tipos.",
  })
  @IsOptional()
  @IsArray()
  @IsEnum(AutoPolizaType, { each: true })
  types?: AutoPolizaType[];
}
