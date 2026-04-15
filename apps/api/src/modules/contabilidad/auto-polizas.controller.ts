import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { AutoPolizasService } from "./auto-polizas.service";
import { GenerateAutoPolizaDto, GenerateBatchAutoPolizaDto } from "./dto/auto-poliza.dto";

@ApiTags("Contabilidad - Polizas Automaticas")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("contabilidad/auto-polizas")
export class AutoPolizasController {
  constructor(private autoPolizasService: AutoPolizasService) {}

  /**
   * List pending business events without journal entries
   */
  @Get("pending")
  @Permissions("contabilidad:view")
  getPending(@CurrentUser() user: JwtPayload) {
    return this.autoPolizasService.getPendingEvents(user.organizationId);
  }

  /**
   * List recently generated auto-entries
   */
  @Get("recent")
  @Permissions("contabilidad:view")
  getRecent(@CurrentUser() user: JwtPayload) {
    return this.autoPolizasService.getRecentAutoEntries(user.organizationId);
  }

  /**
   * Generate a single journal entry from a business event
   */
  @Post("generate")
  @Permissions("contabilidad:create")
  async generate(@CurrentUser() user: JwtPayload, @Body() dto: GenerateAutoPolizaDto) {
    switch (dto.type) {
      case "purchase":
        return this.autoPolizasService.generateFromPurchase(dto.referenceId, user.sub);
      case "sale":
        return this.autoPolizasService.generateFromSale(
          dto.referenceId,
          dto.saleSource || "pos",
          user.sub,
        );
      case "payroll":
        return this.autoPolizasService.generateFromPayroll(dto.referenceId, user.sub);
      case "payment":
        return this.autoPolizasService.generateFromPayment(dto.referenceId, user.sub);
      case "bank_transaction":
        return this.autoPolizasService.generateFromBankTransaction(dto.referenceId, user.sub);
      default:
        throw new Error(`Tipo no soportado: ${dto.type}`);
    }
  }

  /**
   * Batch generate journal entries for all pending events
   */
  @Post("generate-batch")
  @Permissions("contabilidad:create")
  generateBatch(@CurrentUser() user: JwtPayload, @Body() dto: GenerateBatchAutoPolizaDto) {
    return this.autoPolizasService.generateBatch(user.organizationId, user.sub, dto.types);
  }
}
