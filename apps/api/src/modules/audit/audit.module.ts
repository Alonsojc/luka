import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";
import { areQueuesDisabled, DisabledQueueModule } from "../../common/queues/disabled-queue.module";
import { QUEUE_AUDIT_LOG } from "../../common/queues/queues.constants";

const auditQueueImports = areQueuesDisabled()
  ? [DisabledQueueModule.register(QUEUE_AUDIT_LOG)]
  : [BullModule.registerQueue({ name: QUEUE_AUDIT_LOG })];

@Global()
@Module({
  imports: auditQueueImports,
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
