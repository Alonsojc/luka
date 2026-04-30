import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import type { Prisma } from "@luka/database";
import { PrismaService } from "../../prisma/prisma.service";
import { getErrorMessage } from "../queue-error.util";
import { QUEUE_AUDIT_LOG } from "../queues.constants";

@Processor(QUEUE_AUDIT_LOG)
export class AuditLogProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditLogProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<Prisma.AuditLogUncheckedCreateInput>): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: job.data });
    } catch (error: unknown) {
      this.logger.error(`Failed to persist audit log (job ${job.id}): ${getErrorMessage(error)}`);
      throw error; // BullMQ will retry based on defaultJobOptions
    }
  }
}
