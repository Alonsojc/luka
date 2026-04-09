import { Module } from "@nestjs/common";
import { CorntechController } from "./corntech.controller";
import { CorntechService } from "./corntech.service";

@Module({
  controllers: [CorntechController],
  providers: [CorntechService],
  exports: [CorntechService],
})
export class CorntechModule {}
