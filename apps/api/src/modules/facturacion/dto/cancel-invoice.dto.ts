import { IsString, IsOptional } from "class-validator";

export class CancelInvoiceDto {
  @IsString({ message: "Motivo de cancelacion requerido" })
  motivo: string;

  @IsOptional()
  @IsString()
  folioSustitucion?: string;
}
