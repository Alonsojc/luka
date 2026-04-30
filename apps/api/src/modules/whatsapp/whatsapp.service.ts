import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { UpdateWhatsAppConfigDto } from "./dto/update-config.dto";

export const DEFAULT_TEMPLATES: Record<string, string> = {
  STOCK_LOW:
    "\u26a0\ufe0f *Alerta de Stock Bajo*\n\n\ud83d\udccd Sucursal: {{branchName}}\n\ud83d\udce6 Producto: {{productName}} ({{sku}})\n\ud83d\udcca Stock actual: {{currentStock}} {{unit}}\n\ud83d\udcc9 M\u00ednimo: {{minimumStock}} {{unit}}\n\n_Luka System_",
  LOT_EXPIRING:
    "\ud83d\udd34 *Lote por Vencer*\n\n\ud83d\udccd {{branchName}}\n\ud83d\udce6 {{productName}}\n\ud83c\udff7\ufe0f Lote: {{lotNumber}}\n\ud83d\udcc5 Vence: {{expirationDate}}\n\u23f0 D\u00edas restantes: {{daysLeft}}\n\ud83d\udcca Cantidad: {{quantity}} {{unit}}\n\n_Luka System_",
  REQUISITION_NEW:
    "\ud83d\udccb *Nueva Requisici\u00f3n*\n\n\ud83d\udccd De: {{branchName}}\n\ud83d\udc64 Solicit\u00f3: {{requestedBy}}\n\ud83d\udce6 Productos: {{itemCount}}\n\ud83d\udd34 Prioridad: {{priority}}\n\ud83d\udcc5 Entrega: {{deliveryDate}}\n\n_Luka System_",
  REQUISITION_APPROVED:
    "\u2705 *Requisici\u00f3n Aprobada*\n\n\ud83d\udccd Sucursal: {{branchName}}\n\ud83d\udccb Folio: {{folio}}\n\ud83d\udc64 Aprob\u00f3: {{approvedBy}}\n\ud83d\udce6 Productos: {{itemCount}}\n\n_Luka System_",
  DELIVERY_NEW:
    "\ud83d\udeb4 *Nuevo Pedido Delivery*\n\n\ud83d\udccd {{branchName}}\n\ud83d\udcf1 Plataforma: {{platform}}\n\ud83d\udc64 Cliente: {{customerName}}\n\ud83d\udcb0 Total: ${{total}}\n\n_Luka System_",
  DAILY_SUMMARY:
    "\ud83d\udcca *Resumen Diario - {{date}}*\n\n\ud83d\udcb0 Ventas: ${{totalSales}}\n\ud83d\udce6 Requisiciones pendientes: {{pendingRequisitions}}\n\u26a0\ufe0f Productos bajo m\u00ednimo: {{lowStockCount}}\n\ud83d\udd34 Lotes por vencer: {{expiringLots}}\n\ud83d\udccb Transferencias activas: {{activeTransfers}}\n\n_Luka System_",
  OPERATIONAL_RECONCILIATION:
    "*Reconciliacion operativa - {{startDate}} a {{endDate}}*\n\nSucursal: {{branchName}}\nIncidencias: {{issueCount}}\nPOS vs inventario: {{posIssueCount}}\nCEDIS vs sucursal: {{cedisIssueCount}}\nFood cost: {{foodCostIssueCount}}\nDelivery neto: {{deliveryIssueCount}}\nVenta neta delivery: {{deliveryNetRevenue}}\n\nRevisar: {{reportUrl}}\n\n_Luka System_",
};

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------

  async getConfig(organizationId: string) {
    const config = await this.prisma.whatsAppConfig.findUnique({
      where: { organizationId },
    });

    if (!config) {
      // Return a default (inactive) config shape
      return {
        id: null,
        organizationId,
        provider: "mock",
        apiKey: null,
        apiSecret: null,
        phoneNumberId: null,
        isActive: false,
        createdAt: null,
        updatedAt: null,
      };
    }

    // Mask secrets in the response
    return {
      ...config,
      apiKey: config.apiKey ? `****${config.apiKey.slice(-4)}` : null,
      apiSecret: config.apiSecret ? `****${config.apiSecret.slice(-4)}` : null,
    };
  }

  async updateConfig(organizationId: string, dto: UpdateWhatsAppConfigDto) {
    const existing = await this.prisma.whatsAppConfig.findUnique({
      where: { organizationId },
    });

    if (existing) {
      // Only update secrets if they are not masked values
      const data: any = { ...dto };
      if (dto.apiKey?.startsWith("****")) delete data.apiKey;
      if (dto.apiSecret?.startsWith("****")) delete data.apiSecret;

      return this.prisma.whatsAppConfig.update({
        where: { organizationId },
        data,
      });
    }

    return this.prisma.whatsAppConfig.create({
      data: {
        organizationId,
        provider: dto.provider || "mock",
        apiKey: dto.apiKey,
        apiSecret: dto.apiSecret,
        phoneNumberId: dto.phoneNumberId,
        isActive: dto.isActive ?? true,
      },
    });
  }

  // ---------------------------------------------------------------
  // Sending messages
  // ---------------------------------------------------------------

  async sendMessage(
    organizationId: string,
    phone: string,
    message: string,
    alertRuleId?: string,
  ): Promise<{ success: boolean; logId: string }> {
    const config = await this.prisma.whatsAppConfig.findUnique({
      where: { organizationId },
    });

    const provider = config?.provider || "mock";
    const isActive = config?.isActive ?? false;

    // Create log entry
    const log = await this.prisma.alertLog.create({
      data: {
        alertRuleId: alertRuleId || "",
        recipient: phone,
        message,
        status: "PENDING",
      },
    });

    try {
      if (!isActive) {
        this.logger.warn(`WhatsApp is disabled for org ${organizationId}. Message logged only.`);
        await this.prisma.alertLog.update({
          where: { id: log.id },
          data: { status: "SENT", sentAt: new Date() },
        });
        return { success: true, logId: log.id };
      }

      switch (provider) {
        case "mock":
          this.logger.log(`[MOCK WhatsApp] To: ${phone}\n${message}`);
          break;
        case "twilio":
          // Placeholder for Twilio integration
          this.logger.log(`[TWILIO] Would send to ${phone} via Twilio API`);
          break;
        case "meta":
          // Placeholder for Meta/WhatsApp Business API
          this.logger.log(`[META] Would send to ${phone} via Meta WhatsApp API`);
          break;
        default:
          this.logger.warn(`Unknown provider: ${provider}`);
      }

      await this.prisma.alertLog.update({
        where: { id: log.id },
        data: { status: "SENT", sentAt: new Date() },
      });

      return { success: true, logId: log.id };
    } catch (error: any) {
      this.logger.error(`Failed to send WhatsApp to ${phone}: ${error.message}`);
      await this.prisma.alertLog.update({
        where: { id: log.id },
        data: { status: "FAILED", errorMessage: error.message },
      });
      return { success: false, logId: log.id };
    }
  }

  async sendTemplate(
    organizationId: string,
    phone: string,
    templateName: string,
    variables: Record<string, string>,
    alertRuleId?: string,
  ) {
    const template = DEFAULT_TEMPLATES[templateName] || `Template "${templateName}" not found`;
    const rendered = this.renderTemplate(template, variables);
    return this.sendMessage(organizationId, phone, rendered, alertRuleId);
  }

  // ---------------------------------------------------------------
  // Template rendering
  // ---------------------------------------------------------------

  renderTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }

  getDefaultTemplates() {
    return DEFAULT_TEMPLATES;
  }
}
