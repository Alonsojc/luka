export const REGIMEN_FISCAL = [
  { clave: "601", descripcion: "General de Ley Personas Morales" },
  { clave: "603", descripcion: "Personas Morales con Fines no Lucrativos" },
  {
    clave: "605",
    descripcion: "Sueldos y Salarios e Ingresos Asimilados a Salarios",
  },
  { clave: "606", descripcion: "Arrendamiento" },
  { clave: "608", descripcion: "Dem\u00e1s ingresos" },
  {
    clave: "610",
    descripcion: "Residentes en el Extranjero sin Establecimiento Permanente en M\u00e9xico",
  },
  {
    clave: "611",
    descripcion: "Ingresos por Dividendos (socios y accionistas)",
  },
  {
    clave: "612",
    descripcion: "Personas F\u00edsicas con Actividades Empresariales y Profesionales",
  },
  { clave: "614", descripcion: "Ingresos por intereses" },
  { clave: "616", descripcion: "Sin obligaciones fiscales" },
  {
    clave: "620",
    descripcion: "Sociedades Cooperativas de Producci\u00f3n que optan por diferir sus ingresos",
  },
  { clave: "621", descripcion: "Incorporaci\u00f3n Fiscal" },
  {
    clave: "622",
    descripcion: "Actividades Agr\u00edcolas, Ganaderas, Silv\u00edcolas y Pesqueras",
  },
  { clave: "623", descripcion: "Opcional para Grupos de Sociedades" },
  { clave: "624", descripcion: "Coordinados" },
  {
    clave: "625",
    descripcion:
      "R\u00e9gimen de las Actividades Empresariales con ingresos a trav\u00e9s de Plataformas Tecnol\u00f3gicas",
  },
  {
    clave: "626",
    descripcion: "R\u00e9gimen Simplificado de Confianza",
  },
];

export const USO_CFDI = [
  { clave: "G01", descripcion: "Adquisici\u00f3n de mercanc\u00edas" },
  {
    clave: "G02",
    descripcion: "Devoluciones, descuentos o bonificaciones",
  },
  { clave: "G03", descripcion: "Gastos en general" },
  { clave: "I01", descripcion: "Construcciones" },
  {
    clave: "I02",
    descripcion: "Mobiliario y equipo de oficina por inversiones",
  },
  { clave: "I03", descripcion: "Equipo de transporte" },
  {
    clave: "I04",
    descripcion: "Equipo de c\u00f3mputo y accesorios",
  },
  { clave: "I08", descripcion: "Otra maquinaria y equipo" },
  {
    clave: "D01",
    descripcion: "Honorarios m\u00e9dicos, dentales y gastos hospitalarios",
  },
  {
    clave: "D02",
    descripcion: "Gastos m\u00e9dicos por incapacidad o discapacidad",
  },
  { clave: "D03", descripcion: "Gastos funerales" },
  { clave: "D04", descripcion: "Donativos" },
  {
    clave: "D10",
    descripcion: "Pagos por servicios educativos (colegiaturas)",
  },
  { clave: "P01", descripcion: "Por definir" },
  { clave: "S01", descripcion: "Sin efectos fiscales" },
  { clave: "CP01", descripcion: "Pagos" },
  { clave: "CN01", descripcion: "N\u00f3mina" },
];

export const FORMA_PAGO = [
  { clave: "01", descripcion: "Efectivo" },
  { clave: "02", descripcion: "Cheque nominativo" },
  {
    clave: "03",
    descripcion: "Transferencia electr\u00f3nica de fondos",
  },
  { clave: "04", descripcion: "Tarjeta de cr\u00e9dito" },
  { clave: "05", descripcion: "Monedero electr\u00f3nico" },
  { clave: "06", descripcion: "Dinero electr\u00f3nico" },
  { clave: "08", descripcion: "Vales de despensa" },
  { clave: "12", descripcion: "Daci\u00f3n en pago" },
  { clave: "13", descripcion: "Pago por subrogaci\u00f3n" },
  { clave: "14", descripcion: "Pago por consignaci\u00f3n" },
  { clave: "15", descripcion: "Condonaci\u00f3n" },
  { clave: "17", descripcion: "Compensaci\u00f3n" },
  { clave: "23", descripcion: "Novaci\u00f3n" },
  { clave: "24", descripcion: "Confusi\u00f3n" },
  { clave: "25", descripcion: "Remisi\u00f3n de deuda" },
  { clave: "26", descripcion: "Prescripci\u00f3n o caducidad" },
  { clave: "27", descripcion: "A satisfacci\u00f3n del acreedor" },
  { clave: "28", descripcion: "Tarjeta de d\u00e9bito" },
  { clave: "29", descripcion: "Tarjeta de servicios" },
  { clave: "30", descripcion: "Aplicaci\u00f3n de anticipos" },
  { clave: "31", descripcion: "Intermediario pagos" },
  { clave: "99", descripcion: "Por definir" },
];

export const METODO_PAGO = [
  { clave: "PUE", descripcion: "Pago en una sola exhibici\u00f3n" },
  {
    clave: "PPD",
    descripcion: "Pago en parcialidades o diferido",
  },
];

export const TIPO_COMPROBANTE = [
  { clave: "I", descripcion: "Ingreso" },
  { clave: "E", descripcion: "Egreso" },
  { clave: "T", descripcion: "Traslado" },
  { clave: "N", descripcion: "N\u00f3mina" },
  { clave: "P", descripcion: "Pago" },
];

export const MONEDA = [
  { clave: "MXN", descripcion: "Peso Mexicano" },
  { clave: "USD", descripcion: "D\u00f3lar americano" },
  { clave: "EUR", descripcion: "Euro" },
];

export const MOTIVO_CANCELACION = [
  {
    clave: "01",
    descripcion: "Comprobante emitido con errores con relaci\u00f3n",
  },
  {
    clave: "02",
    descripcion: "Comprobante emitido con errores sin relaci\u00f3n",
  },
  {
    clave: "03",
    descripcion: "No se llev\u00f3 a cabo la operaci\u00f3n",
  },
  {
    clave: "04",
    descripcion: "Operaci\u00f3n nominativa relacionada en una factura global",
  },
];
