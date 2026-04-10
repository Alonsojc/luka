function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f5f5f5; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5; padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">
          <!-- Header -->
          <tr>
            <td style="background-color:#000000; padding:24px 32px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:20px; letter-spacing:0.15em; font-weight:400;">
                L U K A &nbsp; P O K E &nbsp; H O U S E
              </h1>
              <p style="color:rgba(255,255,255,0.5); margin:4px 0 0; font-size:11px; letter-spacing:0.1em;">
                SISTEMA DE GESTION
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="background-color:#ffffff; padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; text-align:center;">
              <p style="color:#999; font-size:11px; margin:0;">
                Este correo fue enviado automaticamente por Luka System.<br>
                &copy; ${new Date().getFullYear()} Luka Poke House. Todos los derechos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function passwordResetTemplate(resetUrl: string): string {
  return baseTemplate(`
    <h2 style="color:#333; margin:0 0 16px; font-size:22px; font-weight:600;">
      Restablecer tu contrasena
    </h2>
    <p style="color:#555; font-size:15px; line-height:1.6; margin:0 0 24px;">
      Solicitaste restablecer tu contrasena. Haz clic en el boton para crear una nueva.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:8px 0 24px;">
          <a href="${resetUrl}"
             style="display:inline-block; background-color:#000000; color:#ffffff; text-decoration:none;
                    padding:14px 32px; font-size:14px; font-weight:600; letter-spacing:0.05em;
                    border-radius:4px;">
            RESTABLECER CONTRASENA
          </a>
        </td>
      </tr>
    </table>
    <p style="color:#888; font-size:13px; line-height:1.5; margin:0 0 8px;">
      Este enlace expira en 1 hora.
    </p>
    <p style="color:#888; font-size:13px; line-height:1.5; margin:0;">
      Si no solicitaste esto, ignora este correo.
    </p>
  `);
}

export function welcomeTemplate(
  firstName: string,
  tempPassword?: string,
): string {
  const passwordSection = tempPassword
    ? `
    <p style="color:#555; font-size:15px; line-height:1.6; margin:0 0 8px;">
      Tu contrasena temporal es:
    </p>
    <p style="background-color:#f5f5f5; padding:12px 16px; font-family:monospace; font-size:16px;
              color:#333; border-radius:4px; margin:0 0 16px; display:inline-block;">
      ${tempPassword}
    </p>
    <p style="color:#888; font-size:13px; line-height:1.5; margin:0 0 24px;">
      Te recomendamos cambiarla al iniciar sesion.
    </p>
    `
    : "";

  const webUrl = process.env.WEB_URL || "http://localhost:3002";

  return baseTemplate(`
    <h2 style="color:#333; margin:0 0 16px; font-size:22px; font-weight:600;">
      Bienvenido a Luka System
    </h2>
    <p style="color:#555; font-size:15px; line-height:1.6; margin:0 0 24px;">
      Hola ${firstName}! Tu cuenta en Luka System ha sido creada.
    </p>
    ${passwordSection}
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:8px 0 24px;">
          <a href="${webUrl}"
             style="display:inline-block; background-color:#000000; color:#ffffff; text-decoration:none;
                    padding:14px 32px; font-size:14px; font-weight:600; letter-spacing:0.05em;
                    border-radius:4px;">
            INICIAR SESION
          </a>
        </td>
      </tr>
    </table>
  `);
}

export function lowStockTemplate(
  items: {
    product: string;
    branch: string;
    current: number;
    minimum: number;
  }[],
): string {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px;">
          ${item.product}
        </td>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px;">
          ${item.branch}
        </td>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; font-size:14px; font-weight:600;
                    color:${item.current < item.minimum ? "#dc2626" : "#333"};">
          ${item.current}
        </td>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px;">
          ${item.minimum}
        </td>
      </tr>`,
    )
    .join("");

  return baseTemplate(`
    <h2 style="color:#333; margin:0 0 16px; font-size:22px; font-weight:600;">
      Alerta de Stock Bajo
    </h2>
    <p style="color:#555; font-size:15px; line-height:1.6; margin:0 0 24px;">
      Los siguientes productos estan por debajo del stock minimo:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee; border-radius:4px;">
      <thead>
        <tr style="background-color:#f9f9f9;">
          <th style="padding:10px 12px; text-align:left; font-size:12px; font-weight:600; color:#666;
                     text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #eee;">
            Producto
          </th>
          <th style="padding:10px 12px; text-align:left; font-size:12px; font-weight:600; color:#666;
                     text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #eee;">
            Sucursal
          </th>
          <th style="padding:10px 12px; text-align:left; font-size:12px; font-weight:600; color:#666;
                     text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #eee;">
            Actual
          </th>
          <th style="padding:10px 12px; text-align:left; font-size:12px; font-weight:600; color:#666;
                     text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #eee;">
            Minimo
          </th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `);
}

export function invoiceEmailTemplate(data: {
  recipientName: string;
  invoiceNumber: string;
  total: string;
  currency: string;
  cfdiType: string;
  date: string;
  uuid?: string;
}): string {
  const uuidRow = data.uuid
    ? `
      <tr>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#666; font-size:13px; font-weight:600;">
          UUID
        </td>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px; font-family:monospace;">
          ${data.uuid}
        </td>
      </tr>`
    : "";

  return baseTemplate(`
    <h2 style="color:#333; margin:0 0 16px; font-size:22px; font-weight:600;">
      Factura ${data.invoiceNumber}
    </h2>
    <p style="color:#555; font-size:15px; line-height:1.6; margin:0 0 24px;">
      Hola ${data.recipientName}, adjunto encontraras tu comprobante fiscal digital.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee; border-radius:4px; margin-bottom:24px;">
      <tbody>
        <tr>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#666; font-size:13px; font-weight:600;">
            Folio
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px;">
            ${data.invoiceNumber}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#666; font-size:13px; font-weight:600;">
            Tipo
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px;">
            ${data.cfdiType}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#666; font-size:13px; font-weight:600;">
            Fecha
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px;">
            ${data.date}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#666; font-size:13px; font-weight:600;">
            Total
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:16px; font-weight:600;">
            $${data.total} ${data.currency}
          </td>
        </tr>
        ${uuidRow}
      </tbody>
    </table>
    <p style="color:#555; font-size:14px; line-height:1.6; margin:0 0 16px;">
      Adjunto encontraras tu CFDI en formato XML y PDF.
    </p>
    <p style="color:#888; font-size:12px; line-height:1.5; margin:0; padding-top:16px; border-top:1px solid #eee;">
      Este documento es una representacion impresa de un CFDI. La validez fiscal del comprobante
      se puede verificar en el portal del SAT: <a href="https://verificacfdi.facturaelectronica.sat.gob.mx/"
      style="color:#555;">verificacfdi.facturaelectronica.sat.gob.mx</a>
    </p>
  `);
}

export function requisitionAlertTemplate(data: {
  branchName: string;
  priority: string;
  itemCount: number;
  requestedBy: string;
}): string {
  const priorityColor =
    data.priority === "URGENT"
      ? "#dc2626"
      : data.priority === "HIGH"
        ? "#ea580c"
        : "#333";

  return baseTemplate(`
    <h2 style="color:#333; margin:0 0 16px; font-size:22px; font-weight:600;">
      Nueva Requisicion
    </h2>
    <p style="color:#555; font-size:15px; line-height:1.6; margin:0 0 24px;">
      Se ha generado una nueva requisicion que requiere atencion:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee; border-radius:4px; margin-bottom:24px;">
      <tbody>
        <tr>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#666; font-size:13px; font-weight:600;">
            Sucursal
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px;">
            ${data.branchName}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#666; font-size:13px; font-weight:600;">
            Prioridad
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; font-size:14px; font-weight:600; color:${priorityColor};">
            ${data.priority}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#666; font-size:13px; font-weight:600;">
            Productos
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px;">
            ${data.itemCount} articulo${data.itemCount !== 1 ? "s" : ""}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#666; font-size:13px; font-weight:600;">
            Solicitado por
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px;">
            ${data.requestedBy}
          </td>
        </tr>
      </tbody>
    </table>
    <p style="color:#888; font-size:13px; line-height:1.5; margin:0;">
      Ingresa al sistema para revisar y autorizar la requisicion.
    </p>
  `);
}

export function expiringLotsAlertTemplate(
  lots: {
    product: string;
    branch: string;
    daysLeft: number;
    quantity: number;
  }[],
): string {
  const rows = lots
    .map(
      (lot) => `
      <tr>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px;">
          ${lot.product}
        </td>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px;">
          ${lot.branch}
        </td>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; font-size:14px; font-weight:600;
                    color:${lot.daysLeft <= 3 ? "#dc2626" : lot.daysLeft <= 7 ? "#ea580c" : "#333"};">
          ${lot.daysLeft} dia${lot.daysLeft !== 1 ? "s" : ""}
        </td>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px;">
          ${lot.quantity}
        </td>
      </tr>`,
    )
    .join("");

  return baseTemplate(`
    <h2 style="color:#333; margin:0 0 16px; font-size:22px; font-weight:600;">
      Alerta de Lotes por Vencer
    </h2>
    <p style="color:#555; font-size:15px; line-height:1.6; margin:0 0 24px;">
      Los siguientes lotes estan proximos a su fecha de vencimiento:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee; border-radius:4px;">
      <thead>
        <tr style="background-color:#f9f9f9;">
          <th style="padding:10px 12px; text-align:left; font-size:12px; font-weight:600; color:#666;
                     text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #eee;">
            Producto
          </th>
          <th style="padding:10px 12px; text-align:left; font-size:12px; font-weight:600; color:#666;
                     text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #eee;">
            Sucursal
          </th>
          <th style="padding:10px 12px; text-align:left; font-size:12px; font-weight:600; color:#666;
                     text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #eee;">
            Dias Restantes
          </th>
          <th style="padding:10px 12px; text-align:left; font-size:12px; font-weight:600; color:#666;
                     text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #eee;">
            Cantidad
          </th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `);
}

export function overduePayableTemplate(
  payables: { supplier: string; amount: number; dueDate: string }[],
): string {
  const rows = payables
    .map(
      (p) => `
      <tr>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px;">
          ${p.supplier}
        </td>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#333; font-size:14px; font-weight:600;">
          $${p.amount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
        </td>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#dc2626; font-size:14px; font-weight:600;">
          ${p.dueDate}
        </td>
      </tr>`,
    )
    .join("");

  return baseTemplate(`
    <h2 style="color:#333; margin:0 0 16px; font-size:22px; font-weight:600;">
      Cuentas por Pagar Vencidas
    </h2>
    <p style="color:#555; font-size:15px; line-height:1.6; margin:0 0 24px;">
      Las siguientes cuentas por pagar estan vencidas:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee; border-radius:4px;">
      <thead>
        <tr style="background-color:#f9f9f9;">
          <th style="padding:10px 12px; text-align:left; font-size:12px; font-weight:600; color:#666;
                     text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #eee;">
            Proveedor
          </th>
          <th style="padding:10px 12px; text-align:left; font-size:12px; font-weight:600; color:#666;
                     text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #eee;">
            Monto
          </th>
          <th style="padding:10px 12px; text-align:left; font-size:12px; font-weight:600; color:#666;
                     text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #eee;">
            Fecha Vencimiento
          </th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `);
}
