import { Module } from "@nestjs/common";
import { CfdiController } from "./cfdi.controller";
import { CfdiService } from "./cfdi.service";
import { FacturacionController } from "./facturacion.controller";
import { FacturacionService } from "./facturacion.service";

@Module({
  controllers: [CfdiController, FacturacionController],
  providers: [CfdiService, FacturacionService],
  exports: [CfdiService, FacturacionService],
})
export class FacturacionModule {}
