// SAT Catalogs for CFDI 4.0
// Reference: http://omawww.sat.gob.mx/tramitesyservicios/Paginas/anexo_20.htm

export const SAT_REGIMEN_FISCAL = {
  "601": "General de Ley Personas Morales",
  "603": "Personas Morales con Fines no Lucrativos",
  "605": "Sueldos y Salarios e Ingresos Asimilados a Salarios",
  "606": "Arrendamiento",
  "607": "Régimen de Enajenación o Adquisición de Bienes",
  "608": "Demás ingresos",
  "610": "Residentes en el Extranjero sin Establecimiento Permanente en México",
  "611": "Ingresos por Dividendos (socios y accionistas)",
  "612": "Personas Físicas con Actividades Empresariales y Profesionales",
  "614": "Ingresos por intereses",
  "615": "Régimen de los ingresos por obtención de premios",
  "616": "Sin obligaciones fiscales",
  "620": "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
  "621": "Incorporación Fiscal",
  "622": "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
  "623": "Opcional para Grupos de Sociedades",
  "624": "Coordinados",
  "625":
    "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  "626": "Régimen Simplificado de Confianza",
} as const;

export const SAT_USO_CFDI = {
  G01: "Adquisición de mercancías",
  G02: "Devoluciones, descuentos o bonificaciones",
  G03: "Gastos en general",
  I01: "Construcciones",
  I02: "Mobiliario y equipo de oficina por inversiones",
  I03: "Equipo de transporte",
  I04: "Equipo de cómputo y accesorios",
  I05: "Dados, troqueles, moldes, matrices y herramental",
  I06: "Comunicaciones telefónicas",
  I07: "Comunicaciones satelitales",
  I08: "Otra maquinaria y equipo",
  D01: "Honorarios médicos, dentales y gastos hospitalarios",
  D02: "Gastos médicos por incapacidad o discapacidad",
  D03: "Gastos funerales",
  D04: "Donativos",
  D05: "Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)",
  D06: "Aportaciones voluntarias al SAR",
  D07: "Primas por seguros de gastos médicos",
  D08: "Gastos de transportación escolar obligatoria",
  D09: "Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones",
  D10: "Pagos por servicios educativos (colegiaturas)",
  S01: "Sin efectos fiscales",
  CP01: "Pagos",
} as const;

export const SAT_FORMA_PAGO = {
  "01": "Efectivo",
  "02": "Cheque nominativo",
  "03": "Transferencia electrónica de fondos",
  "04": "Tarjeta de crédito",
  "05": "Monedero electrónico",
  "06": "Dinero electrónico",
  "08": "Vales de despensa",
  "12": "Dación en pago",
  "13": "Pago por subrogación",
  "14": "Pago por consignación",
  "15": "Condonación",
  "17": "Compensación",
  "23": "Novación",
  "24": "Confusión",
  "25": "Remisión de deuda",
  "26": "Prescripción o caducidad",
  "27": "A satisfacción del acreedor",
  "28": "Tarjeta de débito",
  "29": "Tarjeta de servicios",
  "30": "Aplicación de anticipos",
  "31": "Intermediario pagos",
  "99": "Por definir",
} as const;

export const SAT_METODO_PAGO = {
  PUE: "Pago en una sola exhibición",
  PPD: "Pago en parcialidades o diferido",
} as const;

export const SAT_TIPO_RELACION = {
  "01": "Nota de crédito de los documentos relacionados",
  "02": "Nota de débito de los documentos relacionados",
  "03": "Devolución de mercancía sobre facturas o traslados previos",
  "04": "Sustitución de los CFDI previos",
  "05": "Traslados de mercancías facturados previamente",
  "06": "Factura generada por los traslados previos",
  "07": "CFDI por aplicación de anticipo",
  "09": "Factura generada por pagos en parcialidades",
} as const;

export const SAT_MOTIVO_CANCELACION = {
  "01": "Comprobante emitido con errores con relación",
  "02": "Comprobante emitido con errores sin relación",
  "03": "No se llevó a cabo la operación",
  "04": "Operación nominativa relacionada en una factura global",
} as const;

// Common product/service keys for restaurants
export const SAT_CLAVE_PROD_SERV_COMMON = {
  "90101500": "Restaurantes y catering (servicios de comida)",
  "50192100": "Pescado preparado",
  "50181900": "Arroz",
  "50161800": "Vegetales frescos",
  "50131600": "Frutas frescas",
  "50171500": "Salsas y condimentos",
  "50202300": "Algas y productos de algas",
  "50201700": "Productos de soya",
} as const;

// Common unit keys
export const SAT_CLAVE_UNIDAD = {
  E48: "Unidad de servicio",
  H87: "Pieza",
  KGM: "Kilogramo",
  GRM: "Gramo",
  LTR: "Litro",
  MLT: "Mililitro",
  ACT: "Actividad",
} as const;

// Payroll perception types (Complemento Nomina 1.2)
export const SAT_TIPO_PERCEPCION = {
  "001": "Sueldos, Salarios Rayas y Jornales",
  "002": "Gratificación Anual (Aguinaldo)",
  "003": "Participación de los Trabajadores en las Utilidades PTU",
  "004": "Reembolso de Gastos Médicos Dentales y Hospitalarios",
  "005": "Fondo de ahorro",
  "006": "Caja de ahorro",
  "009": "Contribuciones a Cargo del Trabajador Pagadas por el Patrón",
  "010": "Premios por puntualidad",
  "011": "Prima de Antigüedad",
  "012": "Previsión social",
  "013": "Caja de ahorro",
  "014": "Subsidio para el empleo",
  "015": "Honorarios",
  "019": "Horas extra",
  "020": "Prima dominical",
  "021": "Prima vacacional",
  "022": "Prima por antigüedad",
  "023": "Pagos por separación",
  "025": "Indemnizaciones",
  "039": "Jubilaciones, pensiones o haberes de retiro",
  "044": "Jubilaciones, pensiones o haberes de retiro en parcialidades",
  "045": "Ingresos en acciones o títulos valor que representan bienes",
  "046": "Ingresos asimilados a salarios",
  "047": "Alimentación",
  "048": "Habitación",
  "049": "Premios por asistencia",
  "050": "Viáticos",
} as const;

// Payroll deduction types
export const SAT_TIPO_DEDUCCION = {
  "001": "Seguridad social",
  "002": "ISR",
  "003": "Aportaciones a retiro, cesantía en edad avanzada y vejez",
  "004": "Otros",
  "005": "Aportaciones a Fondo de vivienda",
  "006": "Descuento por incapacidad",
  "007": "Pensión alimenticia",
  "008": "Renta",
  "009": "Préstamos provenientes del Fondo Nacional de la Vivienda para los Trabajadores",
  "010": "Pago por crédito de vivienda",
  "011": "Pago de abonos INFONACOT",
  "012": "Anticipo de salarios",
  "013": "Pagos hechos con exceso al trabajador",
  "014": "Errores",
  "015": "Pérdidas",
  "016": "Averías",
  "017": "Adquisición de artículos producidos por la empresa o establecimiento",
  "018": "Cuotas para la constitución y fomento de sociedades cooperativas y de cajas de ahorro",
  "019": "Cuotas sindicales",
  "020": "Ausencia (Ausentismo)",
  "021": "Cuotas obrero patronales",
} as const;
