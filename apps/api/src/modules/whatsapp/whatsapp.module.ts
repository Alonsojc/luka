import { Module } from "@nestjs/common";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppService } from "./whatsapp.service";
import { AlertEngineService } from "./alert-engine.service";

@Module({
  controllers: [WhatsAppController],
  providers: [WhatsAppService, AlertEngineService],
  exports: [WhatsAppService, AlertEngineService],
})
export class WhatsAppModule {}
