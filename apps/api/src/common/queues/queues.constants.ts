export const QUEUE_CORNTECH_SYNC = "corntech-sync";
export const QUEUE_CFDI_TIMBRADO = "cfdi-timbrado";
export const QUEUE_BANK_RECONCILIATION = "bank-reconciliation";
export const QUEUE_AUDIT_LOG = "audit-log";

export const ALL_QUEUES = [
  QUEUE_CORNTECH_SYNC,
  QUEUE_CFDI_TIMBRADO,
  QUEUE_BANK_RECONCILIATION,
  QUEUE_AUDIT_LOG,
] as const;
