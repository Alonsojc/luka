import { z } from "zod";

export const createCFDISchema = z.object({
  branchId: z.string(),
  cfdiType: z.enum(["INGRESO", "EGRESO", "TRASLADO", "NOMINA", "PAGO"]),
  receiverRfc: z.string().min(12, "RFC debe tener al menos 12 caracteres").max(13),
  receiverName: z.string().min(1, "Nombre del receptor requerido"),
  receiverRegimen: z.string().optional(),
  receiverUsoCfdi: z.string().min(1, "Uso de CFDI requerido"),
  paymentMethod: z.enum(["PUE", "PPD"]).optional(),
  paymentForm: z.string().optional(),
  currency: z.string().default("MXN"),
  exchangeRate: z.number().optional(),
  concepts: z
    .array(
      z.object({
        satClaveProdServ: z.string(),
        quantity: z.number().positive(),
        unitOfMeasure: z.string(),
        satClaveUnidad: z.string(),
        description: z.string(),
        unitPrice: z.number().min(0),
        discount: z.number().min(0).default(0),
        taxDetails: z.record(z.unknown()).default({}),
      }),
    )
    .min(1, "Al menos un concepto requerido"),
  relatedCfdis: z
    .array(
      z.object({
        relatedCfdiUuid: z.string().uuid(),
        relationshipType: z.string(),
      }),
    )
    .optional(),
});

export const cancelCFDISchema = z.object({
  uuid: z.string().uuid(),
  cancellationReason: z.enum(["01", "02", "03", "04"]),
  substituteCfdiUuid: z.string().uuid().optional(),
});

export type CreateCFDIInput = z.infer<typeof createCFDISchema>;
export type CancelCFDIInput = z.infer<typeof cancelCFDISchema>;
