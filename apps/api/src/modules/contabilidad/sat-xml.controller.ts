import { Controller, Get, Query, Res, UseGuards, BadRequestException } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { SatXmlService } from "./sat-xml.service";

@ApiTags("Contabilidad - Reportes SAT")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("contabilidad/sat")
export class SatXmlController {
  constructor(private satXmlService: SatXmlService) {}

  /**
   * Preview Catalogo de Cuentas XML (inline response)
   */
  @Get("catalogo")
  @Permissions("contabilidad:view")
  async getCatalogo(
    @CurrentUser() user: JwtPayload,
    @Query("year") yearStr: string,
    @Query("month") monthStr: string,
    @Res() res: Response,
  ) {
    const { year, month } = this.parseYearMonth(yearStr, monthStr);
    const result = await this.satXmlService.generateCatalogoCuentas(
      user.organizationId,
      year,
      month,
    );

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.send(result.xml);
  }

  /**
   * Preview Balanza de Comprobacion XML (inline response)
   */
  @Get("balanza")
  @Permissions("contabilidad:view")
  async getBalanza(
    @CurrentUser() user: JwtPayload,
    @Query("year") yearStr: string,
    @Query("month") monthStr: string,
    @Query("tipo") tipo: string,
    @Res() res: Response,
  ) {
    const { year, month } = this.parseYearMonth(yearStr, monthStr);
    const tipoEnvio = tipo === "C" ? "C" : "N";
    const result = await this.satXmlService.generateBalanzaComprobacion(
      user.organizationId,
      year,
      month,
      tipoEnvio,
    );

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.send(result.xml);
  }

  /**
   * Download Catalogo de Cuentas XML as file attachment
   */
  @Get("catalogo/download")
  @Permissions("contabilidad:view")
  async downloadCatalogo(
    @CurrentUser() user: JwtPayload,
    @Query("year") yearStr: string,
    @Query("month") monthStr: string,
    @Res() res: Response,
  ) {
    const { year, month } = this.parseYearMonth(yearStr, monthStr);
    const result = await this.satXmlService.generateCatalogoCuentas(
      user.organizationId,
      year,
      month,
    );

    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.xml);
  }

  /**
   * Download Balanza de Comprobacion XML as file attachment
   */
  @Get("balanza/download")
  @Permissions("contabilidad:view")
  async downloadBalanza(
    @CurrentUser() user: JwtPayload,
    @Query("year") yearStr: string,
    @Query("month") monthStr: string,
    @Query("tipo") tipo: string,
    @Res() res: Response,
  ) {
    const { year, month } = this.parseYearMonth(yearStr, monthStr);
    const tipoEnvio = tipo === "C" ? "C" : "N";
    const result = await this.satXmlService.generateBalanzaComprobacion(
      user.organizationId,
      year,
      month,
      tipoEnvio,
    );

    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.xml);
  }

  // ── Helpers ──

  private parseYearMonth(yearStr: string, monthStr: string): { year: number; month: number } {
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (isNaN(year) || isNaN(month)) {
      throw new BadRequestException("year y month son requeridos (numeros)");
    }
    if (month < 1 || month > 12) {
      throw new BadRequestException("month debe estar entre 1 y 12");
    }
    return { year, month };
  }
}
