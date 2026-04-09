import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().min(2, "Nombre de sucursal requerido"),
  code: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z0-9]+$/, "Solo mayúsculas y números"),
  city: z.string().min(2, "Ciudad requerida"),
  state: z.string().min(2, "Estado requerido"),
  address: z.string().min(5, "Dirección requerida"),
  postalCode: z
    .string()
    .length(5, "Código postal debe ser de 5 dígitos")
    .regex(/^\d{5}$/, "Solo dígitos"),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  timezone: z.string().default("America/Mexico_City"),
  corntechBranchId: z.string().optional(),
});

export const updateBranchSchema = createBranchSchema.partial();

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
