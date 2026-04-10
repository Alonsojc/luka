import { Module } from "@nestjs/common";
import { CfdiController } from "./cfdi.controller";
import { CfdiService } from "./cfdi.service";
import { FacturacionController } from "./facturacion.controller";
import { FacturacionService } from "./facturacion.service";
import { PacService } from "./pac/pac.service";

@Module({
  controllers: [CfdiController, FacturacionController],
  providers: [CfdiService, FacturacionService, PacService],
  exports: [CfdiService, FacturacionService, PacService],
})
export class FacturacionModule {}
