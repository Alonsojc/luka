import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { FacturacionService } from "../../../modules/facturacion/facturacion.service";
import { QUEUE_CFDI_TIMBRADO } from "../queues.constants";

@Processor(QUEUE_CFDI_TIMBRADO)
export class CfdiTimbradoProcessor extends WorkerHost {
  private readonly logger = new Logger(CfdiTimbradoProcessor.name);

  constructor(private readonly facturacionService: FacturacionService) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.log(
      `Processing job ${job.name} (id=${job.id}) — data: ${JSON.stringify(job.data)}`,
    );

    try {
      switch (job.name) {
        case "stamp-invoice":
          return await this.handleStampInvoice(job);
        case "cancel-invoice":
          return await this.handleCancelInvoice(job);
        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
          return { status: "unknown_job" };
      }
    } catch (error: any) {
      this.logger.error(`Job ${job.name} (id=${job.id}) failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async handleStampInvoice(job: Job) {
    const { organizationId, invoiceId } = job.data;

    try {
      // Generate XML through the existing service (which already handles the
      // CFDI XML building). The actual PAC timbrado call is a placeholder
      // in the service — it sets status to STAMPED.
      const result = await this.facturacionService.generateXml(organizationId, invoiceId);

      this.logger.log(
        `stamp-invoice completed for invoice ${invoiceId} — XML generated, status: STAMPED`,
      );

      // TODO: When a real PAC integration is added, the service.generateXml
      // will call the PAC and return the UUID, sello, etc.
      return {
        status: "stamped",
        invoiceId,
        series: result.invoice.series,
        folio: result.invoice.folio,
      };
    } catch (error: any) {
      this.logger.error(`stamp-invoice failed for ${invoiceId}: ${error.message}`);
      throw error;
    }
  }

  private async handleCancelInvoice(job: Job) {
    const { organizationId, invoiceId, motivo, folioSustitucion } = job.data;

    try {
      // Call the existing cancel method. It currently sets status to
      // CANCELLATION_PENDING or CANCELLED depending on current state.
      // When PAC is integrated, the actual SAT cancellation request
      // will be made here.
      const result = await this.facturacionService.cancelInvoice(
        organizationId,
        invoiceId,
        motivo || "02",
        folioSustitucion,
      );

      this.logger.log(
        `cancel-invoice completed for invoice ${invoiceId} — status: ${result.status}`,
      );

      // TODO: When PAC integration is added, poll for cancellation confirmation
      return {
        status: result.status,
        invoiceId,
      };
    } catch (error: any) {
      this.logger.error(`cancel-invoice failed for ${invoiceId}: ${error.message}`);
      throw error;
    }
  }
}
