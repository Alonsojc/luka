import { Module } from "@nestjs/common";
import { InversionistasController } from "./inversionistas.controller";
import { InversionistasService } from "./inversionistas.service";

@Module({
  controllers: [InversionistasController],
  providers: [InversionistasService],
  exports: [InversionistasService],
})
export class InversionistasModule {}
