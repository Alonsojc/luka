import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";
import { QUEUE_AUDIT_LOG } from "../../common/queues/queues.constants";

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_AUDIT_LOG })],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
