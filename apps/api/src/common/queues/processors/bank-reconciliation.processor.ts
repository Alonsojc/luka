import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { ReconciliationService } from "../../../modules/bancos/reconciliation.service";
import { QUEUE_BANK_RECONCILIATION } from "../queues.constants";

@Processor(QUEUE_BANK_RECONCILIATION)
export class BankReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(BankReconciliationProcessor.name);

  constructor(private readonly reconciliationService: ReconciliationService) {
    super();
  }

  async process(job: Job): Promise<any> {
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
    } catch (error: any) {
      this.logger.error(
        `Job ${job.name} (id=${job.id}) failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async handleAutoReconcile(job: Job) {
    const { organizationId, accountId } = job.data;

    try {
      const result = await this.reconciliationService.autoReconcile(
        organizationId,
        accountId,
      );

      this.logger.log(
        `auto-reconcile completed for account ${accountId}: ${result.matched}/${result.total} matched`,
      );
      return result;
    } catch (error: any) {
      this.logger.error(`auto-reconcile failed: ${error.message}`);
      throw error;
    }
  }

  private async handleImportStatement(job: Job) {
    const { organizationId, accountId, transactions } = job.data;

    try {
      if (!transactions || transactions.length === 0) {
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
    } catch (error: any) {
      this.logger.error(`import-statement failed: ${error.message}`);
      throw error;
    }
  }
}
