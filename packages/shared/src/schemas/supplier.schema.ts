import { z } from "zod";

export const createSupplierSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  rfc: z.string().min(12).max(13).optional(),
  contactName: z.string().optional(),
  email: z.string().email("Email inválido").optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  paymentTermsDays: z.number().int().min(0).default(30),
  bankAccount: z.string().optional(),
  clabe: z
    .string()
    .length(18, "CLABE debe ser de 18 dígitos")
    .regex(/^\d{18}$/)
    .optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
