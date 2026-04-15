import { z } from "zod";

export const createPurchaseOrderSchema = z.object({
  branchId: z.string(),
  supplierId: z.string(),
  currency: z.string().default("MXN"),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().positive("Cantidad debe ser positiva"),
        unitPrice: z.number().min(0, "Precio debe ser positivo"),
        unitOfMeasure: z.string(),
      }),
    )
    .min(1, "Al menos un artículo requerido"),
});

export const receivePurchaseOrderSchema = z.object({
  items: z.array(
    z.object({
      purchaseOrderItemId: z.string(),
      receivedQuantity: z.number().min(0),
    }),
  ),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type ReceivePurchaseOrderInput = z.infer<typeof receivePurchaseOrderSchema>;
