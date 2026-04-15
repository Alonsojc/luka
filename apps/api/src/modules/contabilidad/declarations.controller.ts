import { Controller, Get, Post, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { DeclarationsService } from "./declarations.service";

@ApiTags("Contabilidad - Declaraciones")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("contabilidad/declarations")
export class DeclarationsController {
  constructor(private declarationsService: DeclarationsService) {}

  @Get("iva")
  @Permissions("contabilidad:view")
  getIva(
    @CurrentUser() user: JwtPayload,
    @Query("year") year: string,
    @Query("month") month: string,
  ) {
    return this.declarationsService.calculateIvaProvisional(
      user.organizationId,
      Number(year),
      Number(month),
    );
  }

  @Get("isr")
  @Permissions("contabilidad:view")
  getIsr(
    @CurrentUser() user: JwtPayload,
    @Query("year") year: string,
    @Query("month") month: string,
  ) {
    return this.declarationsService.calculateIsrProvisional(
      user.organizationId,
      Number(year),
      Number(month),
    );
  }

  @Get("summary")
  @Permissions("contabilidad:view")
  getSummary(
    @CurrentUser() user: JwtPayload,
    @Query("year") year: string,
    @Query("month") month: string,
  ) {
    return this.declarationsService.getDeclarationSummary(
      user.organizationId,
      Number(year),
      Number(month),
    );
  }

  @Get("annual")
  @Permissions("contabilidad:view")
  getAnnual(@CurrentUser() user: JwtPayload, @Query("year") year: string) {
    return this.declarationsService.getAnnualSummary(user.organizationId, Number(year));
  }

  @Post("mark-filed")
  @Permissions("contabilidad:edit")
  markFiled(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      year: number;
      month: number;
      type: string;
      filingReference?: string;
      amount?: number;
    },
  ) {
    return this.declarationsService.markAsFiled(
      user.organizationId,
      body.year,
      body.month,
      body.type,
      {
        filingReference: body.filingReference,
        amount: body.amount,
      },
    );
  }

  @Get("history")
  @Permissions("contabilidad:view")
  getHistory(@CurrentUser() user: JwtPayload) {
    return this.declarationsService.getHistory(user.organizationId);
  }
}
