import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { PresentationsService } from "./presentations.service";
import { CreatePresentationDto } from "./dto/create-presentation.dto";
import { UpdatePresentationDto } from "./dto/update-presentation.dto";

@ApiTags("Inventarios - Presentaciones")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inventarios")
export class PresentationsController {
  constructor(private presentationsService: PresentationsService) {}

  /**
   * GET /inventarios/presentations
   * List all presentations (with product info) for dropdown use.
   */
  @Get("presentations")
  @Permissions("inventarios:view")
  findAll(@CurrentUser() user: JwtPayload) {
    return this.presentationsService.findAll(user.organizationId);
  }

  /**
   * GET /inventarios/products/:productId/presentations
   * List presentations for a specific product.
   */
  @Get("products/:productId/presentations")
  @Permissions("inventarios:view")
  findByProduct(@CurrentUser() user: JwtPayload, @Param("productId") productId: string) {
    return this.presentationsService.findByProduct(user.organizationId, productId);
  }

  /**
   * POST /inventarios/products/:productId/presentations
   * Create a new presentation for a product.
   */
  @Post("products/:productId/presentations")
  @Permissions("inventarios:create")
  create(
    @CurrentUser() user: JwtPayload,
    @Param("productId") productId: string,
    @Body() dto: CreatePresentationDto,
  ) {
    return this.presentationsService.create(user.organizationId, productId, dto, user);
  }

  /**
   * PATCH /inventarios/presentations/:id
   * Update a presentation.
   */
  @Patch("presentations/:id")
  @Permissions("inventarios:update")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdatePresentationDto,
  ) {
    return this.presentationsService.update(user.organizationId, id, dto, user);
  }

  /**
   * DELETE /inventarios/presentations/:id
   * Deactivate a presentation.
   */
  @Delete("presentations/:id")
  @Permissions("inventarios:delete")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.presentationsService.remove(user.organizationId, id, user);
  }
}
