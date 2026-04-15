import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { QUEUE_AUDIT_LOG } from "../queues.constants";

@Processor(QUEUE_AUDIT_LOG)
export class AuditLogProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditLogProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<any> {
    try {
      await this.prisma.auditLog.create({ data: job.data });
    } catch (error: any) {
      this.logger.error(`Failed to persist audit log (job ${job.id}): ${error.message}`);
      throw error; // BullMQ will retry based on defaultJobOptions
    }
  }
}
