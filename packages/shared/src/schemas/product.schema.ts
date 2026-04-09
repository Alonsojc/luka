import { z } from "zod";

export const createProductSchema = z.object({
  sku: z.string().min(1, "SKU requerido"),
  name: z.string().min(2, "Nombre requerido"),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  unitOfMeasure: z.string().min(1, "Unidad de medida requerida"),
  costPerUnit: z.number().min(0, "Costo debe ser positivo"),
  satClaveProdServ: z.string().optional(),
  satClaveUnidad: z.string().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const createRecipeSchema = z.object({
  menuItemName: z.string().min(2, "Nombre del platillo requerido"),
  corntechProductId: z.string().optional(),
  yieldQuantity: z.number().positive("Cantidad debe ser positiva"),
  yieldUnit: z.string().min(1, "Unidad requerida"),
  ingredients: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().positive(),
      unitOfMeasure: z.string(),
      wastePercentage: z.number().min(0).max(100).default(0),
    })
  ),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
