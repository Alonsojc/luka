import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { RecipesService } from "./recipes.service";

@ApiTags("Inventarios - Recetas")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inventarios/recipes")
export class RecipesController {
  constructor(private recipesService: RecipesService) {}

  // -- Food cost summary (must be before :id routes) --
  @Get("food-cost-summary")
  @Permissions("inventarios:view")
  getFoodCostSummary(@CurrentUser() user: JwtPayload) {
    return this.recipesService.getFoodCostSummary(user.organizationId);
  }

  @Get()
  @Permissions("inventarios:view")
  findAll(@CurrentUser() user: JwtPayload) {
    return this.recipesService.findAll(user.organizationId);
  }

  @Get(":id")
  @Permissions("inventarios:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.recipesService.findOne(user.organizationId, id);
  }

  // -- Recipe cost breakdown --
  @Get(":id/cost")
  @Permissions("inventarios:view")
  getRecipeCost(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.recipesService.calculateRecipeCost(user.organizationId, id);
  }

  @Post()
  @Permissions("inventarios:create")
  create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      menuItemName: string;
      corntechProductId?: string;
      yieldQuantity: number;
      yieldUnit: string;
      servings?: number;
      sellingPrice?: number;
      targetFoodCost?: number;
      ingredients: Array<{
        productId: string;
        quantity: number;
        unitOfMeasure: string;
        wastePercentage?: number;
      }>;
    },
  ) {
    return this.recipesService.create(user.organizationId, body);
  }

  // -- Recalculate all recipe costs --
  @Post("recalculate")
  @Permissions("inventarios:edit")
  recalculateAll(@CurrentUser() user: JwtPayload) {
    return this.recipesService.recalculateAllCosts(user.organizationId);
  }

  @Patch(":id")
  @Permissions("inventarios:edit")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body()
    body: {
      menuItemName?: string;
      corntechProductId?: string;
      yieldQuantity?: number;
      yieldUnit?: string;
      servings?: number;
      sellingPrice?: number;
      targetFoodCost?: number;
      isActive?: boolean;
      ingredients?: Array<{
        productId: string;
        quantity: number;
        unitOfMeasure: string;
        wastePercentage?: number;
      }>;
    },
  ) {
    return this.recipesService.update(user.organizationId, id, body);
  }

  @Delete(":id")
  @Permissions("inventarios:delete")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.recipesService.remove(user.organizationId, id);
  }
}
