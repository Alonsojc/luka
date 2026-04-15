import { Controller, Get, Post, Param, UseGuards, Header } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { NominaCfdiService } from "./nomina-cfdi.service";

@ApiTags("Nomina - CFDI")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("nomina/cfdi")
export class NominaCfdiController {
  constructor(private nominaCfdiService: NominaCfdiService) {}

  @Get("preview/:receiptId")
  @Permissions("nomina:view")
  @Header("Content-Type", "application/xml")
  preview(@CurrentUser() user: JwtPayload, @Param("receiptId") receiptId: string) {
    return this.nominaCfdiService.getPreview(user.organizationId, receiptId);
  }

  @Post("generate/:receiptId")
  @Permissions("nomina:edit")
  generate(@CurrentUser() user: JwtPayload, @Param("receiptId") receiptId: string) {
    return this.nominaCfdiService.generatePayrollCfdi(user.organizationId, receiptId);
  }

  @Post("generate-batch/:periodId")
  @Permissions("nomina:edit")
  generateBatch(@CurrentUser() user: JwtPayload, @Param("periodId") periodId: string) {
    return this.nominaCfdiService.generateBatchCfdi(user.organizationId, periodId);
  }

  @Get("period/:periodId")
  @Permissions("nomina:view")
  listPeriodCfdis(@CurrentUser() user: JwtPayload, @Param("periodId") periodId: string) {
    return this.nominaCfdiService.listPeriodCfdis(user.organizationId, periodId);
  }
}
