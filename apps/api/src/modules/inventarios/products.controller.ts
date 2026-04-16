import { Controller, Get, Post, Patch, Delete, Param, Body, Res, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { ProductsService } from "./products.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

@ApiTags("Inventarios - Productos")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inventarios/products")
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  @Permissions("inventarios:view")
  findAll(@CurrentUser() user: JwtPayload) {
    return this.productsService.findAll(user.organizationId);
  }

  @Get("export")
  @Permissions("inventarios:view")
  async exportProducts(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const products = await this.productsService.findAll(user.organizationId);

    const header = [
      "SKU",
      "Nombre",
      "Descripcion",
      "Categoria",
      "Unidad de Medida",
      "Costo por Unidad",
      "Clave SAT Prod/Serv",
      "Clave SAT Unidad",
      "Activo",
    ].join(";");

    const rows = products.map((p) =>
      [
        p.sku,
        p.name,
        p.description || "",
        p.category?.name || "",
        p.unitOfMeasure,
        Number(p.costPerUnit).toFixed(2),
        p.satClaveProdServ || "",
        p.satClaveUnidad || "",
        p.isActive ? "Si" : "No",
      ].join(";"),
    );

    const csv = [header, ...rows].join("\n");
    const filename = `Productos_${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  }

  @Get(":id")
  @Permissions("inventarios:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.productsService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions("inventarios:create")
  create(@CurrentUser() user: JwtPayload, @Body() body: CreateProductDto) {
    return this.productsService.create(user.organizationId, body, user);
  }

  @Patch(":id")
  @Permissions("inventarios:update")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: UpdateProductDto,
  ) {
    return this.productsService.update(user.organizationId, id, body, user);
  }

  @Delete(":id")
  @Permissions("inventarios:delete")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.productsService.remove(user.organizationId, id, user);
  }
}
