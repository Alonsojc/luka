import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { CorntechService } from "../../../modules/corntech/corntech.service";
import { QUEUE_CORNTECH_SYNC } from "../queues.constants";

@Processor(QUEUE_CORNTECH_SYNC)
export class CorntechSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CorntechSyncProcessor.name);

  constructor(private readonly corntechService: CorntechService) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.log(
      `Processing job ${job.name} (id=${job.id}) — data: ${JSON.stringify(job.data)}`,
    );

    try {
      switch (job.name) {
        case "sync-sales":
          return await this.handleSyncSales(job);
        case "sync-products":
          return await this.handleSyncProducts(job);
        case "sync-cash-closings":
          return await this.handleSyncCashClosings(job);
        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
          return { status: "unknown_job" };
      }
    } catch (error: any) {
      this.logger.error(`Job ${job.name} (id=${job.id}) failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async handleSyncSales(job: Job) {
    const { organizationId, branchId, sales } = job.data;

    try {
      const result = await this.corntechService.processSalesBatch(
        organizationId,
        branchId,
        sales || [],
      );
      this.logger.log(`sync-sales completed: ${result.synced}/${result.total} synced`);
      return result;
    } catch (error: any) {
      this.logger.error(`sync-sales failed: ${error.message}`);
      throw error;
    }
  }

  private async handleSyncProducts(job: Job) {
    const { branchId, products } = job.data;

    try {
      // bulkUpsertSales handles product-like data through the existing service
      // If a dedicated product sync method exists, use it; otherwise log placeholder
      if (typeof this.corntechService.bulkUpsertSales === "function" && products) {
        const result = await this.corntechService.bulkUpsertSales(branchId, products);
        this.logger.log(`sync-products completed: ${result.synced} synced`);
        return result;
      }

      this.logger.log(
        `sync-products: No dedicated product sync method available — placeholder completed for branch ${branchId}`,
      );
      return { status: "placeholder", branchId };
    } catch (error: any) {
      this.logger.error(`sync-products failed: ${error.message}`);
      throw error;
    }
  }

  private async handleSyncCashClosings(job: Job) {
    const { branchId, closings } = job.data;

    try {
      if (!closings || closings.length === 0) {
        this.logger.log(`sync-cash-closings: No closings provided`);
        return { synced: 0 };
      }

      let synced = 0;
      for (const closing of closings) {
        await this.corntechService.upsertCashClosing({
          branchId,
          ...closing,
        });
        synced++;
      }

      this.logger.log(`sync-cash-closings completed: ${synced} closings synced`);
      return { synced };
    } catch (error: any) {
      this.logger.error(`sync-cash-closings failed: ${error.message}`);
      throw error;
    }
  }
}
