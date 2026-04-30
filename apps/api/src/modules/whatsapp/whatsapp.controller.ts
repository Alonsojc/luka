import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { WhatsAppService } from "./whatsapp.service";
import { AlertEngineService } from "./alert-engine.service";
import { UpdateWhatsAppConfigDto } from "./dto/update-config.dto";
import { CreateAlertRuleDto } from "./dto/create-rule.dto";
import { UpdateAlertRuleDto } from "./dto/update-rule.dto";
import { parseWhatsAppRecipients } from "./whatsapp-recipient.util";

@ApiTags("WhatsApp")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("whatsapp")
export class WhatsAppController {
  constructor(
    private whatsAppService: WhatsAppService,
    private alertEngine: AlertEngineService,
  ) {}

  // ---------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------

  @Get("config")
  @Permissions("sucursales:view")
  getConfig(@CurrentUser() user: JwtPayload) {
    return this.whatsAppService.getConfig(user.organizationId);
  }

  @Put("config")
  @Permissions("sucursales:view")
  updateConfig(@CurrentUser() user: JwtPayload, @Body() dto: UpdateWhatsAppConfigDto) {
    return this.whatsAppService.updateConfig(user.organizationId, dto);
  }

  // ---------------------------------------------------------------
  // Alert Rules
  // ---------------------------------------------------------------

  @Get("rules")
  @Permissions("sucursales:view")
  async findAllRules(@CurrentUser() user: JwtPayload, @Query("eventType") eventType?: string) {
    const where: any = { organizationId: user.organizationId };
    if (eventType) where.eventType = eventType;

    const rules = await this.whatsAppService["prisma"].alertRule.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { logs: true } },
      },
    });

    return { data: rules };
  }

  @Post("rules")
  @Permissions("sucursales:view")
  async createRule(@CurrentUser() user: JwtPayload, @Body() dto: CreateAlertRuleDto) {
    const rule = await this.whatsAppService["prisma"].alertRule.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name,
        eventType: dto.eventType,
        conditions: dto.conditions || {},
        recipients: dto.recipients || [],
        messageTemplate: dto.messageTemplate,
        isActive: dto.isActive ?? true,
      },
    });
    return rule;
  }

  @Patch("rules/:id")
  @Permissions("sucursales:view")
  async updateRule(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateAlertRuleDto,
  ) {
    // Verify ownership
    const existing = await this.whatsAppService["prisma"].alertRule.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) {
      return { error: "Regla no encontrada" };
    }

    const updated = await this.whatsAppService["prisma"].alertRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.eventType !== undefined && { eventType: dto.eventType }),
        ...(dto.conditions !== undefined && { conditions: dto.conditions }),
        ...(dto.recipients !== undefined && { recipients: dto.recipients }),
        ...(dto.messageTemplate !== undefined && {
          messageTemplate: dto.messageTemplate,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return updated;
  }

  @Delete("rules/:id")
  @Permissions("sucursales:view")
  async deleteRule(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    const existing = await this.whatsAppService["prisma"].alertRule.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) {
      return { error: "Regla no encontrada" };
    }

    // Soft-delete: deactivate
    await this.whatsAppService["prisma"].alertRule.update({
      where: { id },
      data: { isActive: false },
    });

    return { success: true };
  }

  @Post("rules/:id/test")
  @Permissions("sucursales:view")
  async testRule(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    const rule = await this.whatsAppService["prisma"].alertRule.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!rule) {
      return { error: "Regla no encontrada" };
    }

    // Generate sample data based on event type
    const sampleData = this.getSampleData(rule.eventType);
    const rendered = this.whatsAppService.renderTemplate(rule.messageTemplate, sampleData);

    const recipients = parseWhatsAppRecipients(rule.recipients);
    const results: Array<{ phone: string; success: boolean; logId: string }> = [];

    for (const recipient of recipients) {
      const result = await this.whatsAppService.sendMessage(
        user.organizationId,
        recipient.phone,
        `[TEST] ${rendered}`,
        rule.id,
      );
      results.push({ phone: recipient.phone, ...result });
    }

    return { results, message: rendered };
  }

  // ---------------------------------------------------------------
  // Alert Logs
  // ---------------------------------------------------------------

  @Get("logs")
  @Permissions("sucursales:view")
  async findAllLogs(
    @CurrentUser() user: JwtPayload,
    @Query("ruleId") ruleId?: string,
    @Query("status") status?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const lim = limit ? parseInt(limit, 10) : 25;
    const skip = (p - 1) * lim;

    const where: any = {
      alertRule: { organizationId: user.organizationId },
    };
    if (ruleId) where.alertRuleId = ruleId;
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      this.whatsAppService["prisma"].alertLog.findMany({
        where,
        include: {
          alertRule: { select: { id: true, name: true, eventType: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: lim,
      }),
      this.whatsAppService["prisma"].alertLog.count({ where }),
    ]);

    return {
      data,
      total,
      page: p,
      limit: lim,
      totalPages: Math.ceil(total / lim),
    };
  }

  // ---------------------------------------------------------------
  // Manual trigger
  // ---------------------------------------------------------------

  @Post("check-alerts")
  @Permissions("sucursales:view")
  async checkAlerts(@CurrentUser() user: JwtPayload) {
    const results = {
      stockAlerts: await this.alertEngine.checkStockAlerts(user.organizationId),
      expirationAlerts: await this.alertEngine.checkExpirationAlerts(user.organizationId),
      dailySummary: await this.alertEngine.sendDailySummary(user.organizationId),
    };

    return results;
  }

  // ---------------------------------------------------------------
  // Default templates
  // ---------------------------------------------------------------

  @Get("templates")
  @Permissions("sucursales:view")
  getDefaultTemplates() {
    return this.whatsAppService.getDefaultTemplates();
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  private getSampleData(eventType: string): Record<string, string> {
    const samples: Record<string, Record<string, string>> = {
      STOCK_LOW: {
        branchName: "Sucursal Centro",
        productName: "Salmon Fresco",
        sku: "SAL-001",
        currentStock: "2.5",
        minimumStock: "10",
        unit: "kg",
      },
      LOT_EXPIRING: {
        branchName: "Sucursal Centro",
        productName: "Atun Fresco",
        lotNumber: "LOT-2024-001",
        expirationDate: "15/04/2024",
        daysLeft: "3",
        quantity: "5.0",
        unit: "kg",
      },
      REQUISITION_NEW: {
        branchName: "Sucursal Norte",
        requestedBy: "Juan Perez",
        itemCount: "5",
        priority: "HIGH",
        deliveryDate: "20/04/2024",
      },
      REQUISITION_APPROVED: {
        branchName: "Sucursal Norte",
        folio: "ABC12345",
        approvedBy: "Maria Garcia",
        itemCount: "5",
      },
      DELIVERY_NEW: {
        branchName: "Sucursal Centro",
        platform: "UberEats",
        customerName: "Carlos Lopez",
        total: "285.00",
      },
      DAILY_SUMMARY: {
        date: new Date().toLocaleDateString("es-MX"),
        totalSales: "15,420.00",
        pendingRequisitions: "3",
        lowStockCount: "7",
        expiringLots: "2",
        activeTransfers: "1",
      },
    };

    return samples[eventType] || {};
  }
}
