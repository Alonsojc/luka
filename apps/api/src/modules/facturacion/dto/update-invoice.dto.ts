import { IsString, IsOptional, IsArray, ValidateNested, Allow } from "class-validator";
import { Type } from "class-transformer";
import { InvoiceConceptDto } from "./create-invoice.dto";

export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  receiverRfc?: string;

  @IsOptional()
  @IsString()
  receiverName?: string;

  @IsOptional()
  @IsString()
  receiverRegimen?: string;

  @IsOptional()
  @IsString()
  receiverUsoCfdi?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  paymentForm?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceConceptDto)
  concepts?: InvoiceConceptDto[];

  @IsOptional()
  @Allow()
  attachments?: any; // JSON array of { filename, url, uploadedAt }
}
