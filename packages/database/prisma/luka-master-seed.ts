import type { PrismaClient } from "@prisma/client";
import {
  LUKA_DEMO_BRANCH_CODES_TO_DEACTIVATE,
  LUKA_MASTER_BRANCHES,
  LUKA_MASTER_CATEGORIES,
  LUKA_MASTER_PRODUCTS,
} from "./data/luka-master-data";

type SeedOptions = {
  deactivateDemoBranches?: boolean;
};

export async function seedLukaMasterData(
  prisma: PrismaClient,
  organizationId: string,
  options: SeedOptions = {},
) {
  const deactivateDemoBranches = options.deactivateDemoBranches ?? true;

  const branchIds: Record<string, string> = {};
  for (const branchData of LUKA_MASTER_BRANCHES) {
    const branch = await prisma.branch.upsert({
      where: { organizationId_code: { organizationId, code: branchData.code } },
      update: {
        name: branchData.name,
        city: branchData.city,
        state: branchData.state,
        address: branchData.address,
        postalCode: branchData.postalCode,
        phone: branchData.phone ?? null,
        branchType: branchData.branchType,
        corntechBranchId: branchData.corntechBranchId,
        isActive: true,
      },
      create: {
        organizationId,
        ...branchData,
        phone: branchData.phone ?? null,
        isActive: true,
      },
    });
    branchIds[branchData.code] = branch.id;
  }

  let deactivatedDemoBranches = 0;
  if (deactivateDemoBranches) {
    const result = await prisma.branch.updateMany({
      where: {
        organizationId,
        code: { in: LUKA_DEMO_BRANCH_CODES_TO_DEACTIVATE },
        isActive: true,
      },
      data: { isActive: false },
    });
    deactivatedDemoBranches = result.count;
  }

  const categoryIds: Record<string, string> = {};
  for (const name of LUKA_MASTER_CATEGORIES) {
    const category = await prisma.productCategory.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: {},
      create: { organizationId, name },
    });
    categoryIds[name] = category.id;
  }

  let productsSeeded = 0;
  let recipesSeeded = 0;
  let inventoryRowsSeeded = 0;

  for (const productData of LUKA_MASTER_PRODUCTS) {
    const categoryId = categoryIds[productData.categoryName] ?? null;
    const product = await prisma.product.upsert({
      where: { organizationId_sku: { organizationId, sku: productData.sku } },
      update: {
        name: productData.name,
        description: `Origen ${productData.source}: ${productData.sourceItemId}`,
        categoryId,
        unitOfMeasure: productData.unitOfMeasure,
        costPerUnit: productData.costPerUnit,
        isActive: true,
      },
      create: {
        organizationId,
        sku: productData.sku,
        name: productData.name,
        description: `Origen ${productData.source}: ${productData.sourceItemId}`,
        categoryId,
        unitOfMeasure: productData.unitOfMeasure,
        costPerUnit: productData.costPerUnit,
        isActive: true,
      },
    });
    productsSeeded++;

    const existingPresentation = await prisma.productPresentation.findFirst({
      where: { productId: product.id, name: "Venta POS" },
    });
    const presentationData = {
      sku: productData.sku,
      conversionFactor: 1,
      conversionUnit: productData.unitOfMeasure,
      purchasePrice: productData.costPerUnit || null,
      salePrice: productData.sellingPrice || null,
      isDefault: true,
      isActive: true,
    };
    if (existingPresentation) {
      await prisma.productPresentation.update({
        where: { id: existingPresentation.id },
        data: presentationData,
      });
    } else {
      await prisma.productPresentation.create({
        data: {
          productId: product.id,
          name: "Venta POS",
          ...presentationData,
        },
      });
    }

    for (const branchCode of productData.branchCodes) {
      const branchId = branchIds[branchCode];
      if (!branchId) continue;
      await prisma.branchInventory.upsert({
        where: { branchId_productId: { branchId, productId: product.id } },
        update: {},
        create: {
          branchId,
          productId: product.id,
          currentQuantity: 0,
          minimumStock: 0,
        },
      });
      inventoryRowsSeeded++;
    }

    const recipeData = {
      menuItemName: productData.name,
      corntechProductId: productData.sku,
      yieldQuantity: 1,
      yieldUnit: productData.unitOfMeasure,
      servings: 1,
      sellingPrice: productData.sellingPrice || null,
      totalCost: productData.costPerUnit || null,
      costPerServing: productData.costPerUnit || null,
      isActive: true,
    };
    const existingRecipe = await prisma.recipe.findFirst({
      where: { organizationId, corntechProductId: productData.sku },
    });
    if (existingRecipe) {
      await prisma.recipe.update({
        where: { id: existingRecipe.id },
        data: recipeData,
      });
    } else {
      await prisma.recipe.create({
        data: {
          organizationId,
          ...recipeData,
        },
      });
    }
    recipesSeeded++;
  }

  return {
    branchIds,
    branchesSeeded: LUKA_MASTER_BRANCHES.length,
    deactivatedDemoBranches,
    categoriesSeeded: LUKA_MASTER_CATEGORIES.length,
    productsSeeded,
    recipesSeeded,
    inventoryRowsSeeded,
  };
}
