export interface WhatsAppRecipient {
  phone: string;
}

export function parseWhatsAppRecipients(value: unknown): WhatsAppRecipient[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];

    const phone = (entry as { phone?: unknown }).phone;
    return typeof phone === "string" && phone.trim() ? [{ phone }] : [];
  });
}
