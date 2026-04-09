import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
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
import { SuaService } from "./sua.service";

@ApiTags("Nomina - SUA / IMSS")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("nomina/sua")
export class SuaController {
  constructor(private suaService: SuaService) {}

  /**
   * Preview movements for the given month.
   */
  @Get("preview")
  @Permissions("nomina:view")
  async preview(
    @CurrentUser() user: JwtPayload,
    @Query("year") yearStr: string,
    @Query("month") monthStr: string,
  ) {
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    return this.suaService.generateSuaMovements(
      user.organizationId,
      year,
      month,
    );
  }

  /**
   * Get IMSS contribution summary for the given month.
   */
  @Get("summary")
  @Permissions("nomina:view")
  async summary(
    @CurrentUser() user: JwtPayload,
    @Query("year") yearStr: string,
    @Query("month") monthStr: string,
  ) {
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    return this.suaService.generateSuaPaymentSummary(
      user.organizationId,
      year,
      month,
    );
  }

  /**
   * Generate and save SUA file export.
   */
  @Post("generate")
  @Permissions("nomina:create")
  async generate(
    @CurrentUser() user: JwtPayload,
    @Query("year") yearStr: string,
    @Query("month") monthStr: string,
  ) {
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    return this.suaService.saveSuaExport(
      user.organizationId,
      year,
      month,
      user.sub,
    );
  }

  /**
   * Download SUA file as .sua attachment.
   */
  @Get("download")
  @Permissions("nomina:view")
  async download(
    @CurrentUser() user: JwtPayload,
    @Query("year") yearStr: string,
    @Query("month") monthStr: string,
    @Res() res: Response,
  ) {
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const content = await this.suaService.getSuaFileContent(
      user.organizationId,
      year,
      month,
    );

    const monthPad = String(month).padStart(2, "0");
    const filename = `SUA_${year}_${monthPad}.sua`;

    res.set({
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res.send(content);
  }

  /**
   * List previous SUA exports.
   */
  @Get("history")
  @Permissions("nomina:view")
  async history(@CurrentUser() user: JwtPayload) {
    return this.suaService.getSuaHistory(user.organizationId);
  }
}
