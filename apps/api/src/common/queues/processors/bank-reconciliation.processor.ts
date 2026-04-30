import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { ReconciliationService } from "../../../modules/bancos/reconciliation.service";
import type { ImportTransactionItemDto } from "../../../modules/bancos/dto/import-transactions.dto";
import { getErrorMessage, getErrorStack } from "../queue-error.util";
import { QUEUE_BANK_RECONCILIATION } from "../queues.constants";

interface BankReconciliationJobData {
  organizationId?: string;
  accountId?: string;
  transactions?: ImportTransactionItemDto[];
}

@Processor(QUEUE_BANK_RECONCILIATION)
export class BankReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(BankReconciliationProcessor.name);

  constructor(private readonly reconciliationService: ReconciliationService) {
    super();
  }

  async process(job: Job<BankReconciliationJobData>): Promise<unknown> {
    this.logger.log(
      `Processing job ${job.name} (id=${job.id}) — data: ${JSON.stringify(job.data)}`,
    );

    try {
      switch (job.name) {
        case "auto-reconcile":
          return await this.handleAutoReconcile(job);
        case "import-statement":
          return await this.handleImportStatement(job);
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

  private async handleAutoReconcile(job: Job<BankReconciliationJobData>) {
    const organizationId = this.requireString(job.data.organizationId, "organizationId");
    const accountId = this.requireString(job.data.accountId, "accountId");

    try {
      const result = await this.reconciliationService.autoReconcile(organizationId, accountId);

      this.logger.log(
        `auto-reconcile completed for account ${accountId}: ${result.matched}/${result.total} matched`,
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(`auto-reconcile failed: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  private async handleImportStatement(job: Job<BankReconciliationJobData>) {
    const organizationId = this.requireString(job.data.organizationId, "organizationId");
    const accountId = this.requireString(job.data.accountId, "accountId");
    const transactions = job.data.transactions ?? [];

    try {
      if (transactions.length === 0) {
        this.logger.log(`import-statement: No transactions to import`);
        return { imported: 0 };
      }

      const result = await this.reconciliationService.importStatement(
        organizationId,
        accountId,
        transactions,
      );

      this.logger.log(
        `import-statement completed for account ${accountId}: ${result.imported} imported`,
      );
      return { imported: result.imported };
    } catch (error: unknown) {
      this.logger.error(`import-statement failed: ${getErrorMessage(error)}`);
      throw error;
    }
  }
}
