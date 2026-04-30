import { Controller, Get, Post, Patch, Param, Body, Query, Res, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { FacturacionService } from "./facturacion.service";
import {
  REGIMEN_FISCAL,
  USO_CFDI,
  FORMA_PAGO,
  METODO_PAGO,
  TIPO_COMPROBANTE,
  MONEDA,
  MOTIVO_CANCELACION,
} from "./cfdi/catalogos-sat";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { UpdateInvoiceDto } from "./dto/update-invoice.dto";
import { CancelInvoiceDto } from "./dto/cancel-invoice.dto";
import { CreatePaymentComplementDto } from "./dto/create-payment-complement.dto";

@ApiTags("Facturacion")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("facturacion")
export class FacturacionController {
  constructor(private facturacionService: FacturacionService) {}

  // -------------------------------------------------------
  // SAT Catalogs
  // -------------------------------------------------------

  @Get("catalogos")
  @Permissions("facturacion:view")
  getCatalogos() {
    return {
      regimenFiscal: REGIMEN_FISCAL,
      usoCfdi: USO_CFDI,
      formaPago: FORMA_PAGO,
      metodoPago: METODO_PAGO,
      tipoComprobante: TIPO_COMPROBANTE,
      moneda: MONEDA,
      motivoCancelacion: MOTIVO_CANCELACION,
    };
  }

  // -------------------------------------------------------
  // Invoice CRUD
  // -------------------------------------------------------

  @Get("invoices")
  @Permissions("facturacion:view")
  findAllInvoices(@CurrentUser() user: JwtPayload) {
    return this.facturacionService.findAllInvoices(user.organizationId);
  }

  @Get("invoices/:id")
  @Permissions("facturacion:view")
  findOneInvoice(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.facturacionService.findOneInvoice(user.organizationId, id);
  }

  @Post("invoices")
  @Permissions("facturacion:create")
  createInvoice(@CurrentUser() user: JwtPayload, @Body() dto: CreateInvoiceDto) {
    return this.facturacionService.createInvoice(user.organizationId, user.sub, dto);
  }

  @Patch("invoices/:id")
  @Permissions("facturacion:update")
  updateInvoice(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.facturacionService.updateInvoice(user.organizationId, id, dto);
  }

  // -------------------------------------------------------
  // CFDI XML Generation
  // -------------------------------------------------------

  @Post("invoices/:id/xml")
  @Permissions("facturacion:update")
  generateXml(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.facturacionService.generateXml(user.organizationId, id);
  }

  @Get("invoices/:id/xml")
  @Permissions("facturacion:view")
  async downloadXml(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const { xml, filename } = await this.facturacionService.getXml(user.organizationId, id);

    res.set({
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res.send(xml);
  }

  // -------------------------------------------------------
  // Cancellation
  // -------------------------------------------------------

  @Post("invoices/:id/cancel")
  @Permissions("facturacion:update")
  cancelInvoice(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: CancelInvoiceDto,
  ) {
    return this.facturacionService.cancelInvoice(
      user.organizationId,
      id,
      dto.motivo,
      dto.folioSustitucion,
    );
  }

  // -------------------------------------------------------
  // Payment Complement (Complemento de Pago 2.0)
  // -------------------------------------------------------

  @Post("payment-complement")
  @Permissions("facturacion:create")
  createPaymentComplement(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePaymentComplementDto,
  ) {
    return this.facturacionService.createPaymentComplement(user.organizationId, user.sub, dto);
  }

  @Get("payment-complements")
  @Permissions("facturacion:view")
  getPaymentComplements(@CurrentUser() user: JwtPayload, @Query("status") status?: string) {
    return this.facturacionService.getPaymentComplements(
      user.organizationId,
      status ? { status } : undefined,
    );
  }

  @Get("pending-payments")
  @Permissions("facturacion:view")
  getPendingPayments(@CurrentUser() user: JwtPayload) {
    return this.facturacionService.getPendingPayments(user.organizationId);
  }
}
