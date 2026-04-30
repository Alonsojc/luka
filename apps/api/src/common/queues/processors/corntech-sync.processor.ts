import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { CorntechService } from "../../../modules/corntech/corntech.service";
import { getErrorMessage, getErrorStack } from "../queue-error.util";
import { QUEUE_CORNTECH_SYNC } from "../queues.constants";

interface PosSaleItemJobData {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface PosSaleJobData {
  ticketNumber: string;
  date: string;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  terminalId?: string;
  items: PosSaleItemJobData[];
}

interface CorntechSaleJobData {
  corntechSaleId: string;
  saleDate: string;
  ticketNumber?: string;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod?: string;
  items?: unknown[];
}

interface CashClosingJobData {
  corntechClosingId: string;
  closingDate: string;
  totalCash: number;
  totalCard: number;
  totalOther?: number;
  expectedTotal: number;
  actualTotal: number;
  difference?: number;
  cashierName?: string;
}

interface CorntechSyncJobData {
  organizationId?: string;
  branchId?: string;
  sales?: PosSaleJobData[];
  products?: CorntechSaleJobData[];
  closings?: CashClosingJobData[];
}

@Processor(QUEUE_CORNTECH_SYNC)
export class CorntechSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CorntechSyncProcessor.name);

  constructor(private readonly corntechService: CorntechService) {
    super();
  }

  async process(job: Job<CorntechSyncJobData>): Promise<unknown> {
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
    } catch (error: unknown) {
      this.logger.error(
        `Job ${job.name} (id=${job.id}) failed: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  private requireString(value: string | undefined, field: string): string {
    if (!value) {
      throw new Error(`Missing required job field: ${field}`);
    }
    return value;
  }

  private async handleSyncSales(job: Job<CorntechSyncJobData>) {
    const organizationId = this.requireString(job.data.organizationId, "organizationId");
    const branchId = this.requireString(job.data.branchId, "branchId");
    const sales = job.data.sales ?? [];

    try {
      const result = await this.corntechService.processSalesBatch(organizationId, branchId, sales);
      this.logger.log(`sync-sales completed: ${result.synced}/${result.total} synced`);
      return result;
    } catch (error: unknown) {
      this.logger.error(`sync-sales failed: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  private async handleSyncProducts(job: Job<CorntechSyncJobData>) {
    const branchId = this.requireString(job.data.branchId, "branchId");
    const products = job.data.products ?? [];

    try {
      // bulkUpsertSales handles product-like data through the existing service
      // If a dedicated product sync method exists, use it; otherwise log placeholder
      if (typeof this.corntechService.bulkUpsertSales === "function" && products.length > 0) {
        const result = await this.corntechService.bulkUpsertSales(branchId, products);
        this.logger.log(`sync-products completed: ${result.synced} synced`);
        return result;
      }

      this.logger.log(
        `sync-products: No dedicated product sync method available — placeholder completed for branch ${branchId}`,
      );
      return { status: "placeholder", branchId };
    } catch (error: unknown) {
      this.logger.error(`sync-products failed: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  private async handleSyncCashClosings(job: Job<CorntechSyncJobData>) {
    const branchId = this.requireString(job.data.branchId, "branchId");
    const closings = job.data.closings ?? [];

    try {
      if (closings.length === 0) {
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
    } catch (error: unknown) {
      this.logger.error(`sync-cash-closings failed: ${getErrorMessage(error)}`);
      throw error;
    }
  }
}
