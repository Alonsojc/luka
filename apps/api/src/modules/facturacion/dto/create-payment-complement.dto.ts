import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsDateString,
  ValidateNested,
  Min,
  MinLength,
} from "class-validator";
import { Type } from "class-transformer";

export class RelatedDocumentDto {
  @IsString()
  @MinLength(1, { message: "cfdiId es requerido" })
  cfdiId: string;

  @IsNumber()
  @Min(0.01, { message: "El monto pagado debe ser mayor a 0" })
  amountPaid: number;
}

export class CreatePaymentComplementDto {
  @IsDateString({}, { message: "Fecha de pago invalida" })
  paymentDate: string;

  @IsString()
  @MinLength(1, { message: "Forma de pago es requerida" })
  paymentForm: string;

  @IsNumber()
  @Min(0.01, { message: "El monto debe ser mayor a 0" })
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RelatedDocumentDto)
  relatedDocuments: RelatedDocumentDto[];
}
