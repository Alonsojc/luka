import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Logger,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import type { JobType } from "bullmq";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { Roles } from "../decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../decorators/current-user.decorator";
import { getErrorMessage } from "./queue-error.util";
import {
  QUEUE_CORNTECH_SYNC,
  QUEUE_CFDI_TIMBRADO,
  QUEUE_BANK_RECONCILIATION,
  ALL_QUEUES,
} from "./queues.constants";

const JOB_STATUSES = [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
] as const satisfies readonly JobType[];

type QueueJobStatus = (typeof JOB_STATUSES)[number];

function isQueueJobStatus(status: string | undefined): status is QueueJobStatus {
  return typeof status === "string" && (JOB_STATUSES as readonly string[]).includes(status);
}

@Controller("queues")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("owner")
export class QueuesController {
  private readonly logger = new Logger(QueuesController.name);

  constructor(
    @InjectQueue(QUEUE_CORNTECH_SYNC)
    private readonly corntechQueue: Queue,
    @InjectQueue(QUEUE_CFDI_TIMBRADO)
    private readonly cfdiQueue: Queue,
    @InjectQueue(QUEUE_BANK_RECONCILIATION)
    private readonly bankQueue: Queue,
  ) {}

  private getQueue(name: string): Queue | null {
    switch (name) {
      case QUEUE_CORNTECH_SYNC:
        return this.corntechQueue;
      case QUEUE_CFDI_TIMBRADO:
        return this.cfdiQueue;
      case QUEUE_BANK_RECONCILIATION:
        return this.bankQueue;
      default:
        return null;
    }
  }

  @Get()
  async listQueues(@CurrentUser() user: JwtPayload) {
    const results: Array<{
      name: string;
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    }> = [];

    for (const name of ALL_QUEUES) {
      const queue = this.getQueue(name);
      if (!queue) continue;

      const jobs = await queue.getJobs([...JOB_STATUSES], 0, 999);
      const tenantJobs = jobs.filter((job) =>
        this.jobBelongsToOrganization(job, user.organizationId),
      );

      results.push({
        name,
        waiting: tenantJobs.filter((job) => this.getJobStatus(job) === "waiting").length,
        active: tenantJobs.filter((job) => this.getJobStatus(job) === "active").length,
        completed: tenantJobs.filter((job) => this.getJobStatus(job) === "completed").length,
        failed: tenantJobs.filter((job) => this.getJobStatus(job) === "failed").length,
        delayed: tenantJobs.filter((job) => this.getJobStatus(job) === "delayed").length,
      });
    }

    return results;
  }

  @Get("health")
  async healthCheck() {
    try {
      // Use one of the queues to check Redis connectivity
      const client = await this.corntechQueue.client;
      const pong = await client.ping();
      return {
        redis: pong === "PONG" ? "connected" : "error",
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Redis health check failed: ${message}`);
      return {
        redis: "disconnected",
        error: message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get(":name/jobs")
  async listJobs(
    @CurrentUser() user: JwtPayload,
    @Param("name") name: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const queue = this.getQueue(name);
    if (!queue) {
      return { error: "Cola no encontrada", jobs: [] };
    }

    const pageNum = Math.max(1, parseInt(page || "1", 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit || "20", 10)));
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum - 1;

    const jobStatus = isQueueJobStatus(status) ? status : undefined;

    const jobs = jobStatus
      ? await queue.getJobs([jobStatus], start, end)
      : await queue.getJobs([...JOB_STATUSES], start, end);
    const tenantJobs = jobs.filter((job) =>
      this.jobBelongsToOrganization(job, user.organizationId),
    );

    return {
      queue: name,
      page: pageNum,
      limit: limitNum,
      jobs: tenantJobs.map((job) => ({
        id: job.id,
        name: job.name,
        status: this.getJobStatus(job),
        data: job.data,
        progress: job.progress,
        attempts: job.attemptsMade,
        failedReason: job.failedReason || null,
        processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
        finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
        timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      })),
    };
  }

  @Post(":name/retry-failed")
  async retryFailed(@CurrentUser() user: JwtPayload, @Param("name") name: string) {
    const queue = this.getQueue(name);
    if (!queue) {
      return { error: "Cola no encontrada" };
    }

    const failedJobs = await queue.getJobs(["failed"]);
    const tenantFailedJobs = failedJobs.filter((job) =>
      this.jobBelongsToOrganization(job, user.organizationId),
    );
    let retried = 0;

    for (const job of tenantFailedJobs) {
      try {
        await job.retry();
        retried++;
      } catch (error: unknown) {
        this.logger.warn(`Could not retry job ${job.id}: ${getErrorMessage(error)}`);
      }
    }

    this.logger.log(`Retried ${retried} failed jobs in queue "${name}"`);
    return { queue: name, retried, total: tenantFailedJobs.length };
  }

  @Post(":name/clean")
  async cleanQueue(@Param("name") name: string) {
    const queue = this.getQueue(name);
    if (!queue) {
      return { error: "Cola no encontrada" };
    }

    throw new BadRequestException(
      `Limpieza global de cola "${name}" deshabilitada: requiere alcance por organizationId`,
    );
  }

  private jobBelongsToOrganization(job: { data?: unknown }, organizationId: string): boolean {
    const data = job.data;
    return (
      typeof data === "object" &&
      data !== null &&
      "organizationId" in data &&
      (data as { organizationId?: unknown }).organizationId === organizationId
    );
  }

  private getJobStatus(job: {
    finishedOn?: number | null;
    failedReason?: string | null;
    processedOn?: number | null;
    delay?: number;
  }) {
    if (job.finishedOn) {
      return job.failedReason ? "failed" : "completed";
    }
    if (job.processedOn) {
      return "active";
    }
    if (job.delay && job.delay > 0) {
      return "delayed";
    }
    return "waiting";
  }
}
