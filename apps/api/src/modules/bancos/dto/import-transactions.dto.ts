import {
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class ImportTransactionItemDto {
  @IsDateString({}, { message: "Fecha invalida" })
  date: string;

  @IsNumber({}, { message: "Monto debe ser un numero" })
  amount: number;

  @IsIn(["credit", "debit"], { message: "Tipo debe ser credit o debit" })
  type: "credit" | "debit";

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ImportTransactionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportTransactionItemDto)
  @IsNotEmpty({ message: "Debe incluir al menos una transaccion" })
  transactions: ImportTransactionItemDto[];
}
