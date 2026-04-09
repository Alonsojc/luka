import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  MinLength,
  Matches,
  Min,
} from "class-validator";

export class CreateProductDto {
  @IsString()
  @Matches(/^[A-Z0-9-]+$/, {
    message: "El SKU solo puede contener letras mayusculas, numeros y guiones",
  })
  sku: string;

  @IsString()
  @MinLength(2, { message: "El nombre debe tener al menos 2 caracteres" })
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsString()
  @IsIn(["PIEZA", "KG", "LT", "PAQUETE", "CAJA"], {
    message: "Unidad de medida invalida",
  })
  unitOfMeasure: string;

  @IsNumber({}, { message: "El costo por unidad debe ser un numero" })
  @Min(0, { message: "El costo por unidad no puede ser negativo" })
  costPerUnit: number;

  @IsOptional()
  @IsString()
  satClaveProdServ?: string;

  @IsOptional()
  @IsString()
  satClaveUnidad?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
