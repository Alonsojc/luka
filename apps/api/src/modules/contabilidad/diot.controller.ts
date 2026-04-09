import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { DiotService } from "./diot.service";

@ApiTags("Contabilidad - DIOT")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("contabilidad/diot")
export class DiotController {
  constructor(private diotService: DiotService) {}

  /**
   * Preview DIOT data (table of records per supplier)
   */
  @Get("preview")
  @Permissions("contabilidad:view")
  async preview(
    @CurrentUser() user: JwtPayload,
    @Query("year") yearStr: string,
    @Query("month") monthStr: string,
  ) {
    const { year, month } = this.parseYearMonth(yearStr, monthStr);
    return this.diotService.generateDiot(user.organizationId, year, month);
  }

  /**
   * Get DIOT summary stats for a given month
   */
  @Get("summary")
  @Permissions("contabilidad:view")
  async summary(
    @CurrentUser() user: JwtPayload,
    @Query("year") yearStr: string,
    @Query("month") monthStr: string,
  ) {
    const { year, month } = this.parseYearMonth(yearStr, monthStr);
    return this.diotService.getDiotSummary(user.organizationId, year, month);
  }

  /**
   * Generate DIOT and return structured data
   */
  @Post("generate")
  @Permissions("contabilidad:create")
  async generate(
    @CurrentUser() user: JwtPayload,
    @Query("year") yearStr: string,
    @Query("month") monthStr: string,
  ) {
    const { year, month } = this.parseYearMonth(yearStr, monthStr);
    const records = await this.diotService.generateDiot(
      user.organizationId,
      year,
      month,
    );
    const fileContent = await this.diotService.generateDiotFile(
      user.organizationId,
      year,
      month,
    );
    return {
      year,
      month,
      records,
      recordCount: records.length,
      totalAmount: records.reduce((s, r) => s + r.totalPaid, 0),
      fileContent,
    };
  }

  /**
   * Download DIOT as pipe-delimited .txt file
   */
  @Get("download")
  @Permissions("contabilidad:view")
  async download(
    @CurrentUser() user: JwtPayload,
    @Query("year") yearStr: string,
    @Query("month") monthStr: string,
    @Res() res: Response,
  ) {
    const { year, month } = this.parseYearMonth(yearStr, monthStr);
    const fileContent = await this.diotService.generateDiotFile(
      user.organizationId,
      year,
      month,
    );

    const filename = `DIOT_${year}_${String(month).padStart(2, "0")}.txt`;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(fileContent);
  }

  /**
   * Get history of months with available DIOT data
   */
  @Get("history")
  @Permissions("contabilidad:view")
  async history(@CurrentUser() user: JwtPayload) {
    return this.diotService.getDiotHistory(user.organizationId);
  }

  // ---- helpers ----

  private parseYearMonth(
    yearStr: string,
    monthStr: string,
  ): { year: number; month: number } {
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (isNaN(year) || isNaN(month)) {
      throw new BadRequestException("year y month son requeridos (numeros)");
    }
    return { year, month };
  }
}
