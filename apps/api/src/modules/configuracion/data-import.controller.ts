import { Controller, Get, Post, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { DataImportService } from "./data-import.service";

@ApiTags("Configuracion - Import")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("configuracion/import")
export class DataImportController {
  constructor(private dataImportService: DataImportService) {}

  @Post("validate")
  @Permissions("configuracion:update")
  validate(
    @CurrentUser() user: JwtPayload,
    @Body() body: { importType: string; csvContent: string },
  ) {
    return this.dataImportService.validateCsv(
      user.organizationId,
      body.importType,
      body.csvContent,
    );
  }

  @Post("execute")
  @Permissions("configuracion:update")
  async execute(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      importType: string;
      csvContent: string;
      branchId?: string;
      mappings?: Record<string, string>;
    },
  ) {
    const { importType, csvContent, branchId, mappings } = body;

    switch (importType) {
      case "PRODUCTS":
        return this.dataImportService.importProducts(
          user.organizationId,
          user.sub,
          csvContent,
          mappings || {},
        );
      case "SUPPLIERS":
        return this.dataImportService.importSuppliers(user.organizationId, user.sub, csvContent);
      case "EMPLOYEES":
        return this.dataImportService.importEmployees(
          user.organizationId,
          user.sub,
          csvContent,
          branchId!,
        );
      case "INVENTORY":
        return this.dataImportService.importInventory(
          user.organizationId,
          user.sub,
          csvContent,
          branchId!,
        );
      case "CUSTOMERS":
        return this.dataImportService.importCustomers(user.organizationId, user.sub, csvContent);
      default:
        return { error: `Tipo de importacion no soportado: ${importType}` };
    }
  }

  @Get("history")
  @Permissions("configuracion:view")
  getHistory(@CurrentUser() user: JwtPayload) {
    return this.dataImportService.getImportHistory(user.organizationId);
  }

  @Get("template/:type")
  @Permissions("configuracion:view")
  getTemplate(@Param("type") type: string) {
    const csv = this.dataImportService.getTemplate(type);
    return { csv };
  }

  @Get(":id")
  @Permissions("configuracion:view")
  getDetail(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.dataImportService.getImportDetail(user.organizationId, id);
  }
}
