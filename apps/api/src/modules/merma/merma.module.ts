import { Module } from "@nestjs/common";
import { MermaController } from "./merma.controller";
import { MermaService } from "./merma.service";

@Module({
  controllers: [MermaController],
  providers: [MermaService],
  exports: [MermaService],
})
export class MermaModule {}
