import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

interface IngredientCostDetail {
  productName: string;
  quantity: number;
  unit: string;
  wastePercentage: number;
  unitCost: number;
  totalCost: number;
}

interface RecipeCostResult {
  recipeName: string;
  servings: number;
  ingredients: IngredientCostDetail[];
  totalCost: number;
  costPerServing: number;
  sellingPrice: number;
  foodCostPercentage: number;
  grossMargin: number;
  marginPercentage: number;
}

interface FoodCostSummaryItem {
  id: string;
  name: string;
  servings: number;
  totalCost: number;
  costPerServing: number;
  sellingPrice: number;
  foodCostPercentage: number;
  status: "OPTIMAL" | "WARNING" | "CRITICAL";
}

@Injectable()
export class RecipesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.recipe.findMany({
      where: { organizationId },
      include: {
        ingredients: { include: { product: true } },
      },
      orderBy: { menuItemName: "asc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { id, organizationId },
      include: {
        ingredients: { include: { product: true } },
      },
    });
    if (!recipe) {
      throw new NotFoundException("Receta no encontrada");
    }
    return recipe;
  }

  async create(
    organizationId: string,
    data: {
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
    const { ingredients, ...recipeData } = data;
    const recipe = await this.prisma.recipe.create({
      data: {
        organizationId,
        ...recipeData,
        ingredients: {
          create: ingredients,
        },
      },
      include: {
        ingredients: { include: { product: true } },
      },
    });

    // Auto-calculate costs after creation
    await this.calculateAndStoreCost(recipe.id);

    return this.prisma.recipe.findUnique({
      where: { id: recipe.id },
      include: { ingredients: { include: { product: true } } },
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: {
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
    await this.findOne(organizationId, id);
    const { ingredients, ...recipeData } = data;

    const recipe = await this.prisma.$transaction(async (tx) => {
      if (ingredients) {
        await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
        await tx.recipeIngredient.createMany({
          data: ingredients.map((ing) => ({ recipeId: id, ...ing })),
        });
      }

      return tx.recipe.update({
        where: { id },
        data: recipeData,
        include: {
          ingredients: { include: { product: true } },
        },
      });
    });

    // Auto-recalculate costs after update
    await this.calculateAndStoreCost(id);

    return this.prisma.recipe.findUnique({
      where: { id },
      include: { ingredients: { include: { product: true } } },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.recipe.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // =========================================================================
  // Recipe Costing Methods
  // =========================================================================

  /**
   * Calculate cost for a single recipe, update the DB, and return the breakdown.
   */
  async calculateRecipeCost(
    organizationId: string,
    recipeId: string,
  ): Promise<RecipeCostResult> {
    const recipe = await this.findOne(organizationId, recipeId);
    return this.computeCostBreakdown(recipe);
  }

  /**
   * Recalculate costs for all recipes in an organization.
   */
  async recalculateAllCosts(organizationId: string) {
    const recipes = await this.prisma.recipe.findMany({
      where: { organizationId },
      include: { ingredients: { include: { product: true } } },
    });

    const results: RecipeCostResult[] = [];
    for (const recipe of recipes) {
      const result = await this.computeCostBreakdown(recipe);
      results.push(result);
    }
    return results;
  }

  /**
   * Food cost summary across all recipes in an organization.
   */
  async getFoodCostSummary(
    organizationId: string,
  ): Promise<FoodCostSummaryItem[]> {
    const recipes = await this.prisma.recipe.findMany({
      where: { organizationId },
      include: { ingredients: { include: { product: true } } },
      orderBy: { menuItemName: "asc" },
    });

    return recipes.map((recipe) => {
      let totalCost = 0;
      recipe.ingredients.forEach((ing) => {
        const qty = Number(ing.quantity);
        const waste = Number(ing.wastePercentage) || 0;
        const effectiveQty = qty * (1 + waste / 100);
        totalCost += effectiveQty * Number(ing.product.costPerUnit);
      });

      const servings = recipe.servings || 1;
      const costPerServing = totalCost / servings;
      const sellingPrice = Number(recipe.sellingPrice || 0);
      const foodCostPct =
        sellingPrice > 0 ? (costPerServing / sellingPrice) * 100 : 0;

      let status: "OPTIMAL" | "WARNING" | "CRITICAL";
      if (foodCostPct <= 30) {
        status = "OPTIMAL";
      } else if (foodCostPct <= 35) {
        status = "WARNING";
      } else {
        status = "CRITICAL";
      }

      return {
        id: recipe.id,
        name: recipe.menuItemName,
        servings,
        totalCost: Math.round(totalCost * 100) / 100,
        costPerServing: Math.round(costPerServing * 100) / 100,
        sellingPrice,
        foodCostPercentage: Math.round(foodCostPct * 100) / 100,
        status,
      };
    });
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private async computeCostBreakdown(recipe: any): Promise<RecipeCostResult> {
    let totalCost = 0;

    const ingredientCosts: IngredientCostDetail[] = recipe.ingredients.map(
      (ing: any) => {
        const qty = Number(ing.quantity);
        const waste = Number(ing.wastePercentage) || 0;
        const effectiveQty = qty * (1 + waste / 100);
        const unitCost = Number(ing.product.costPerUnit);
        const ingredientTotal = effectiveQty * unitCost;
        totalCost += ingredientTotal;

        return {
          productName: ing.product.name,
          quantity: qty,
          unit: ing.unitOfMeasure,
          wastePercentage: waste,
          unitCost,
          totalCost: Math.round(ingredientTotal * 100) / 100,
        };
      },
    );

    const servings = recipe.servings || 1;
    const costPerServing = totalCost / servings;
    const sellingPrice = Number(recipe.sellingPrice || 0);
    const foodCostPercentage =
      sellingPrice > 0 ? (costPerServing / sellingPrice) * 100 : 0;
    const grossMargin = sellingPrice - costPerServing;
    const marginPercentage =
      sellingPrice > 0 ? (grossMargin / sellingPrice) * 100 : 0;

    // Persist computed costs
    await this.prisma.recipe.update({
      where: { id: recipe.id },
      data: {
        totalCost: Math.round(totalCost * 100) / 100,
        costPerServing: Math.round(costPerServing * 100) / 100,
      },
    });

    return {
      recipeName: recipe.menuItemName,
      servings,
      ingredients: ingredientCosts,
      totalCost: Math.round(totalCost * 100) / 100,
      costPerServing: Math.round(costPerServing * 100) / 100,
      sellingPrice,
      foodCostPercentage: Math.round(foodCostPercentage * 100) / 100,
      grossMargin: Math.round(grossMargin * 100) / 100,
      marginPercentage: Math.round(marginPercentage * 100) / 100,
    };
  }

  private async calculateAndStoreCost(recipeId: string): Promise<void> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: { ingredients: { include: { product: true } } },
    });
    if (!recipe) return;

    let totalCost = 0;
    recipe.ingredients.forEach((ing) => {
      const qty = Number(ing.quantity);
      const waste = Number(ing.wastePercentage) || 0;
      const effectiveQty = qty * (1 + waste / 100);
      totalCost += effectiveQty * Number(ing.product.costPerUnit);
    });

    const servings = recipe.servings || 1;
    const costPerServing = totalCost / servings;

    await this.prisma.recipe.update({
      where: { id: recipeId },
      data: {
        totalCost: Math.round(totalCost * 100) / 100,
        costPerServing: Math.round(costPerServing * 100) / 100,
      },
    });
  }
}
