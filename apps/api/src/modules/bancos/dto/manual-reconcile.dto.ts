import { IsIn, IsString } from "class-validator";

export class ManualReconcileDto {
  @IsIn(["payable", "receivable", "payment"], {
    message: "Tipo debe ser payable, receivable o payment",
  })
  type: "payable" | "receivable" | "payment";

  @IsString({ message: "entityId es requerido" })
  entityId: string;
}
