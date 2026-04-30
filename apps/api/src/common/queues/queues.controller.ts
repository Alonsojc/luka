import { Controller, Get, Post, Param, Query, UseGuards, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import type { JobType } from "bullmq";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { Roles } from "../decorators/roles.decorator";
import { getErrorMessage } from "./queue-error.util";
import {
  QUEUE_CORNTECH_SYNC,
  QUEUE_CFDI_TIMBRADO,
  QUEUE_BANK_RECONCILIATION,
  ALL_QUEUES,
} from "./queues.constants";

const JOB_STATUSES = ["waiting", "active", "completed", "failed", "delayed"] as const satisfies
  readonly JobType[];

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
  async listQueues() {
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

      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      results.push({
        name,
        waiting,
        active,
        completed,
        failed,
        delayed,
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

    return {
      queue: name,
      page: pageNum,
      limit: limitNum,
      jobs: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        status: job.finishedOn
          ? job.failedReason
            ? "failed"
            : "completed"
          : job.processedOn
            ? "active"
            : "waiting",
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
  async retryFailed(@Param("name") name: string) {
    const queue = this.getQueue(name);
    if (!queue) {
      return { error: "Cola no encontrada" };
    }

    const failedJobs = await queue.getJobs(["failed"]);
    let retried = 0;

    for (const job of failedJobs) {
      try {
        await job.retry();
        retried++;
      } catch (error: unknown) {
        this.logger.warn(`Could not retry job ${job.id}: ${getErrorMessage(error)}`);
      }
    }

    this.logger.log(`Retried ${retried} failed jobs in queue "${name}"`);
    return { queue: name, retried, total: failedJobs.length };
  }

  @Post(":name/clean")
  async cleanQueue(@Param("name") name: string) {
    const queue = this.getQueue(name);
    if (!queue) {
      return { error: "Cola no encontrada" };
    }

    const gracePeriod = 24 * 60 * 60 * 1000; // 24 hours in ms

    const [cleanedCompleted, cleanedFailed] = await Promise.all([
      queue.clean(gracePeriod, 1000, "completed"),
      queue.clean(gracePeriod, 1000, "failed"),
    ]);

    const totalCleaned = cleanedCompleted.length + cleanedFailed.length;

    this.logger.log(
      `Cleaned ${totalCleaned} jobs from queue "${name}" (completed: ${cleanedCompleted.length}, failed: ${cleanedFailed.length})`,
    );

    return {
      queue: name,
      cleaned: {
        completed: cleanedCompleted.length,
        failed: cleanedFailed.length,
        total: totalCleaned,
      },
    };
  }
}
