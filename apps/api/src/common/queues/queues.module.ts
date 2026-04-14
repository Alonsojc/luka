import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueuesController } from "./queues.controller";
import { CorntechSyncProcessor } from "./processors/corntech-sync.processor";
import { CfdiTimbradoProcessor } from "./processors/cfdi-timbrado.processor";
import { BankReconciliationProcessor } from "./processors/bank-reconciliation.processor";
import { AuditLogProcessor } from "./processors/audit-log.processor";
import { CorntechModule } from "../../modules/corntech/corntech.module";
import { FacturacionModule } from "../../modules/facturacion/facturacion.module";
import { BancosModule } from "../../modules/bancos/bancos.module";
import {
  QUEUE_CORNTECH_SYNC,
  QUEUE_CFDI_TIMBRADO,
  QUEUE_BANK_RECONCILIATION,
  QUEUE_AUDIT_LOG,
} from "./queues.constants";

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: {
          age: 24 * 60 * 60, // keep completed jobs for 24h
          count: 500,
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60, // keep failed jobs for 7 days
        },
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_CORNTECH_SYNC },
      { name: QUEUE_CFDI_TIMBRADO },
      { name: QUEUE_BANK_RECONCILIATION },
      { name: QUEUE_AUDIT_LOG },
    ),
    CorntechModule,
    FacturacionModule,
    BancosModule,
  ],
  controllers: [QueuesController],
  providers: [
    CorntechSyncProcessor,
    CfdiTimbradoProcessor,
    BankReconciliationProcessor,
    AuditLogProcessor,
  ],
  exports: [BullModule],
})
export class QueuesModule {}
