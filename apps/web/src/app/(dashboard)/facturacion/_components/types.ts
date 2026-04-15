// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Concepto {
  satClaveProdServ: string;
  quantity: number;
  satClaveUnidad: string;
  unitOfMeasure: string;
  description: string;
  unitPrice: number;
  importe: number;
  withIva: boolean;
}

export type CfdiStatus = "DRAFT" | "STAMPED" | "CANCELLED" | "CANCELLATION_PENDING" | "SENT";

export interface Cfdi {
  id: string;
  series: string;
  folio: string;
  uuid: string | null;
  receiverRfc: string;
  receiverName: string;
  receiverRegimen: string | null;
  receiverUsoCfdi: string;
  receiverDomicilioFiscal: string | null;
  issuerRfc: string;
  issuerName: string;
  issuerRegimen: string;
  subtotal: number | string;
  total: number | string;
  currency: string;
  exchangeRate: number | string | null;
  paymentMethod: string | null;
  paymentForm: string | null;
  exportacion: string | null;
  lugarExpedicion: string | null;
  status: CfdiStatus;
  createdAt: string;
  stampedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  xmlContent: string | null;
  branchId: string;
  concepts: ConceptoApi[];
  attachments?: CfdiAttachment[] | null;
}

export interface CfdiAttachment {
  filename: string;
  url: string;
  size?: number;
  uploadedAt: string;
}

export interface ConceptoApi {
  id: string;
  satClaveProdServ: string;
  quantity: number | string;
  satClaveUnidad: string;
  unitOfMeasure: string;
  description: string;
  unitPrice: number | string;
  amount: number | string;
  taxDetails: Record<string, unknown>;
}

export interface PendingPayment {
  id: string;
  series: string | null;
  folio: string | null;
  uuid: string | null;
  receiverRfc: string;
  receiverName: string;
  total: number;
  totalPaid: number;
  saldoPendiente: number;
  currency: string;
  createdAt: string;
  branchName: string | null;
}

export interface PaymentComplementRelatedDoc {
  cfdiId: string;
  uuid: string;
  serie: string;
  folio: string;
  amountPaid: number;
  saldoAnterior: number;
  saldoInsoluto: number;
  numParcialidad: number;
}

export interface PaymentComplement {
  id: string;
  series: string | null;
  folio: string | null;
  uuid: string | null;
  status: CfdiStatus;
  createdAt: string;
  stampedAt: string | null;
  xmlContent: string | null;
  receiverRfc: string;
  receiverName: string;
  complement: {
    id: string;
    paymentDate: string;
    paymentForm: string;
    currency: string;
    amount: number | string;
    relatedDocuments: PaymentComplementRelatedDoc[];
  } | null;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
}

export interface CatalogItem {
  clave: string;
  descripcion: string;
}

// ---------------------------------------------------------------------------
// SAT Catalog Constants (hardcoded fallback)
// ---------------------------------------------------------------------------

export const REGIMEN_FISCAL: CatalogItem[] = [
  { clave: "601", descripcion: "General de Ley Personas Morales" },
  { clave: "603", descripcion: "Personas Morales con Fines no Lucrativos" },
  { clave: "605", descripcion: "Sueldos y Salarios e Ingresos Asimilados a Salarios" },
  { clave: "606", descripcion: "Arrendamiento" },
  { clave: "607", descripcion: "Regimen de Enajenacion o Adquisicion de Bienes" },
  { clave: "608", descripcion: "Demas ingresos" },
  {
    clave: "610",
    descripcion: "Residentes en el Extranjero sin Establecimiento Permanente en Mexico",
  },
  { clave: "611", descripcion: "Ingresos por Dividendos (socios y accionistas)" },
  { clave: "612", descripcion: "Personas Fisicas con Actividades Empresariales y Profesionales" },
  { clave: "614", descripcion: "Ingresos por intereses" },
  { clave: "615", descripcion: "Regimen de los ingresos por obtencion de premios" },
  { clave: "616", descripcion: "Sin obligaciones fiscales" },
  {
    clave: "620",
    descripcion: "Sociedades Cooperativas de Produccion que optan por diferir sus ingresos",
  },
  { clave: "621", descripcion: "Incorporacion Fiscal" },
  { clave: "622", descripcion: "Actividades Agricolas, Ganaderas, Silvicolas y Pesqueras" },
  { clave: "623", descripcion: "Opcional para Grupos de Sociedades" },
  { clave: "624", descripcion: "Coordinados" },
  {
    clave: "625",
    descripcion:
      "Regimen de las Actividades Empresariales con ingresos a traves de Plataformas Tecnologicas",
  },
  { clave: "626", descripcion: "Regimen Simplificado de Confianza" },
];

export const USO_CFDI: CatalogItem[] = [
  { clave: "G01", descripcion: "Adquisicion de mercancias" },
  { clave: "G02", descripcion: "Devoluciones, descuentos o bonificaciones" },
  { clave: "G03", descripcion: "Gastos en general" },
  { clave: "I01", descripcion: "Construcciones" },
  { clave: "I02", descripcion: "Mobiliario y equipo de oficina por inversiones" },
  { clave: "I03", descripcion: "Equipo de transporte" },
  { clave: "I04", descripcion: "Equipo de computo y accesorios" },
  { clave: "I05", descripcion: "Dados, troqueles, moldes, matrices y herramental" },
  { clave: "I06", descripcion: "Comunicaciones telefonicas" },
  { clave: "I07", descripcion: "Comunicaciones satelitales" },
  { clave: "I08", descripcion: "Otra maquinaria y equipo" },
  { clave: "D01", descripcion: "Honorarios medicos, dentales y gastos hospitalarios" },
  { clave: "D02", descripcion: "Gastos medicos por incapacidad o discapacidad" },
  { clave: "D03", descripcion: "Gastos funerales" },
  { clave: "D04", descripcion: "Donativos" },
  {
    clave: "D05",
    descripcion:
      "Intereses reales efectivamente pagados por creditos hipotecarios (casa habitacion)",
  },
  { clave: "D06", descripcion: "Aportaciones voluntarias al SAR" },
  { clave: "D07", descripcion: "Primas por seguros de gastos medicos" },
  { clave: "D08", descripcion: "Gastos de transportacion escolar obligatoria" },
  {
    clave: "D09",
    descripcion:
      "Depositos en cuentas para el ahorro, primas que tengan como base planes de pensiones",
  },
  { clave: "D10", descripcion: "Pagos por servicios educativos (colegiaturas)" },
  { clave: "S01", descripcion: "Sin efectos fiscales" },
  { clave: "CP01", descripcion: "Pagos" },
  { clave: "CN01", descripcion: "Nomina" },
];

export const FORMA_PAGO: CatalogItem[] = [
  { clave: "01", descripcion: "Efectivo" },
  { clave: "02", descripcion: "Cheque nominativo" },
  { clave: "03", descripcion: "Transferencia electronica de fondos" },
  { clave: "04", descripcion: "Tarjeta de credito" },
  { clave: "05", descripcion: "Monedero electronico" },
  { clave: "06", descripcion: "Dinero electronico" },
  { clave: "08", descripcion: "Vales de despensa" },
  { clave: "12", descripcion: "Dacion en pago" },
  { clave: "13", descripcion: "Pago por subrogacion" },
  { clave: "14", descripcion: "Pago por consignacion" },
  { clave: "15", descripcion: "Condonacion" },
  { clave: "17", descripcion: "Compensacion" },
  { clave: "23", descripcion: "Novacion" },
  { clave: "24", descripcion: "Confusion" },
  { clave: "25", descripcion: "Remision de deuda" },
  { clave: "26", descripcion: "Prescripcion o caducidad" },
  { clave: "27", descripcion: "A satisfaccion del acreedor" },
  { clave: "28", descripcion: "Tarjeta de debito" },
  { clave: "29", descripcion: "Tarjeta de servicios" },
  { clave: "30", descripcion: "Aplicacion de anticipos" },
  { clave: "31", descripcion: "Intermediario pagos" },
  { clave: "99", descripcion: "Por definir" },
];

export const METODO_PAGO: CatalogItem[] = [
  { clave: "PUE", descripcion: "Pago en una sola exhibicion" },
  { clave: "PPD", descripcion: "Pago en parcialidades o diferido" },
];

export const TIPO_COMPROBANTE: CatalogItem[] = [
  { clave: "I", descripcion: "Ingreso" },
  { clave: "E", descripcion: "Egreso" },
  { clave: "T", descripcion: "Traslado" },
  { clave: "N", descripcion: "Nomina" },
  { clave: "P", descripcion: "Pago" },
];

export const MONEDA: CatalogItem[] = [
  { clave: "MXN", descripcion: "Peso Mexicano" },
  { clave: "USD", descripcion: "Dolar Americano" },
  { clave: "EUR", descripcion: "Euro" },
  { clave: "GBP", descripcion: "Libra Esterlina" },
  { clave: "CAD", descripcion: "Dolar Canadiense" },
  { clave: "JPY", descripcion: "Yen Japones" },
];

export const EXPORTACION: CatalogItem[] = [
  { clave: "01", descripcion: "No aplica" },
  { clave: "02", descripcion: "Definitiva" },
  { clave: "03", descripcion: "Temporal" },
];

export const CLAVE_UNIDAD: CatalogItem[] = [
  { clave: "E48", descripcion: "Unidad de servicio" },
  { clave: "H87", descripcion: "Pieza" },
  { clave: "KGM", descripcion: "Kilogramo" },
  { clave: "LTR", descripcion: "Litro" },
  { clave: "XBX", descripcion: "Caja" },
  { clave: "EA", descripcion: "Elemento" },
  { clave: "ACT", descripcion: "Actividad" },
  { clave: "E51", descripcion: "Trabajo" },
  { clave: "MTR", descripcion: "Metro" },
  { clave: "KWH", descripcion: "Kilowatt hora" },
];

export const MOTIVOS_CANCELACION: CatalogItem[] = [
  { clave: "01", descripcion: "Comprobante emitido con errores con relacion" },
  { clave: "02", descripcion: "Comprobante emitido con errores sin relacion" },
  { clave: "03", descripcion: "No se llevo a cabo la operacion" },
  { clave: "04", descripcion: "Operacion nominativa relacionada en una factura global" },
];

export const ALL_CATALOGS: { name: string; data: CatalogItem[] }[] = [
  { name: "Regimen Fiscal", data: REGIMEN_FISCAL },
  { name: "Uso CFDI", data: USO_CFDI },
  { name: "Forma de Pago", data: FORMA_PAGO },
  { name: "Metodo de Pago", data: METODO_PAGO },
  { name: "Tipo de Comprobante", data: TIPO_COMPROBANTE },
  { name: "Moneda", data: MONEDA },
  { name: "Clave Unidad", data: CLAVE_UNIDAD },
  { name: "Exportacion", data: EXPORTACION },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TABS = ["Facturas", "Nueva Factura", "Complementos de Pago", "Catalogos SAT"] as const;

export const STATUS_VARIANT: Record<string, string> = {
  DRAFT: "gray",
  STAMPED: "green",
  CANCELLED: "red",
  CANCELLATION_PENDING: "yellow",
  SENT: "blue",
};

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  STAMPED: "Timbrada",
  CANCELLED: "Cancelada",
  CANCELLATION_PENDING: "Cancelacion Pendiente",
  SENT: "Enviada",
};

export const PAGE_SIZE = 10;

export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "string" ? parseFloat(v) || 0 : v;
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export const EMPTY_CONCEPTO: Concepto = {
  satClaveProdServ: "",
  quantity: 1,
  satClaveUnidad: "E48",
  unitOfMeasure: "Unidad de servicio",
  description: "",
  unitPrice: 0,
  importe: 0,
  withIva: true,
};
