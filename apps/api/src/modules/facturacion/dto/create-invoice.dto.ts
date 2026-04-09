import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  MinLength,
  Min,
  IsObject,
} from "class-validator";
import { Type } from "class-transformer";

export class InvoiceConceptDto {
  @IsString()
  @MinLength(1)
  satClaveProdServ: string;

  @IsNumber()
  @Min(0.01, { message: "La cantidad debe ser mayor a 0" })
  quantity: number;

  @IsString()
  @MinLength(1)
  unitOfMeasure: string;

  @IsString()
  @MinLength(1)
  satClaveUnidad: string;

  @IsString()
  @MinLength(1)
  description: string;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsObject()
  taxDetails?: Record<string, any>;
}

export class CreateInvoiceDto {
  @IsString()
  branchId: string;

  @IsString()
  cfdiType: string;

  @IsOptional()
  @IsString()
  series?: string;

  @IsOptional()
  @IsString()
  folio?: string;

  @IsString()
  issuerRfc: string;

  @IsString()
  issuerName: string;

  @IsString()
  issuerRegimen: string;

  @IsString()
  receiverRfc: string;

  @IsString()
  receiverName: string;

  @IsOptional()
  @IsString()
  receiverRegimen?: string;

  @IsString()
  receiverUsoCfdi: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  paymentForm?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceConceptDto)
  concepts: InvoiceConceptDto[];
}
