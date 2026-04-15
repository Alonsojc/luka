import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PacProvider, PacStampResponse, PacCancelResponse } from "./pac.interface";

/**
 * Sandbox PAC provider for development and testing.
 * Simulates timbrado and cancelacion responses without connecting to a real PAC.
 */
@Injectable()
export class PacSandboxProvider implements PacProvider {
  private readonly logger = new Logger(PacSandboxProvider.name);

  name = "sandbox";

  async stamp(xml: string, rfc: string): Promise<PacStampResponse> {
    this.logger.log(`[SANDBOX] Stamping CFDI for RFC: ${rfc}`);

    const uuid = randomUUID().toUpperCase();
    const fechaTimbrado = new Date().toISOString().replace(/\.\d{3}Z$/, "");
    const sello =
      "SANDBOX" +
      Buffer.from(uuid + fechaTimbrado)
        .toString("base64")
        .slice(0, 80);
    const noCertificadoSAT = "30001000000400002495";

    const cadenaOriginal = `||1.1|${uuid}|${fechaTimbrado}|${sello.slice(0, 40)}|${noCertificadoSAT}||`;

    // Append a simulated TimbreFiscalDigital to the XML
    const timbreFiscal = [
      `<tfd:TimbreFiscalDigital`,
      `  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"`,
      `  xsi:schemaLocation="http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd"`,
      `  Version="1.1"`,
      `  UUID="${uuid}"`,
      `  FechaTimbrado="${fechaTimbrado}"`,
      `  RfcProvCertif="SPR190613I52"`,
      `  SelloCFD="${sello.slice(0, 40)}..."`,
      `  NoCertificadoSAT="${noCertificadoSAT}"`,
      `  SelloSAT="SANDBOX_SELLO_SAT..."`,
      `/>`,
    ].join("\n  ");

    // Insert the timbre before the closing </cfdi:Comprobante> tag
    const xmlTimbrado = xml.includes("</cfdi:Comprobante>")
      ? xml.replace(
          "</cfdi:Comprobante>",
          `  <cfdi:Complemento>\n    ${timbreFiscal}\n  </cfdi:Complemento>\n</cfdi:Comprobante>`,
        )
      : xml + `\n<!-- TimbreFiscalDigital -->\n${timbreFiscal}`;

    this.logger.log(`[SANDBOX] Stamped with UUID: ${uuid}`);

    return {
      uuid,
      sello,
      noCertificadoSAT,
      cadenaOriginal,
      fechaTimbrado,
      xmlTimbrado,
    };
  }

  async cancel(
    uuid: string,
    rfc: string,
    motivo: string,
    folioSustitucion?: string,
  ): Promise<PacCancelResponse> {
    this.logger.log(`[SANDBOX] Cancelling UUID: ${uuid} for RFC: ${rfc} - Motivo: ${motivo}`);

    const fechaCancelacion = new Date().toISOString().replace(/\.\d{3}Z$/, "");

    const acuse = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">`,
      `  <s:Body>`,
      `    <CancelaCFDResponse xmlns="http://cancelacfd.sat.gob.mx">`,
      `      <CancelaCFDResult>`,
      `        <Acuse>`,
      `          <Fecha>${fechaCancelacion}</Fecha>`,
      `          <RfcEmisor>${rfc}</RfcEmisor>`,
      `          <Folios>`,
      `            <UUID>${uuid}</UUID>`,
      `            <EstatusUUID>201</EstatusUUID>`,
      `          </Folios>`,
      folioSustitucion ? `          <FolioSustitucion>${folioSustitucion}</FolioSustitucion>` : "",
      `        </Acuse>`,
      `      </CancelaCFDResult>`,
      `    </CancelaCFDResponse>`,
      `  </s:Body>`,
      `</s:Envelope>`,
    ]
      .filter(Boolean)
      .join("\n");

    this.logger.log(`[SANDBOX] Cancelled UUID: ${uuid}`);

    return {
      success: true,
      acuse,
      fechaCancelacion,
    };
  }

  async getStatus(uuid: string, rfc: string): Promise<{ status: string; cancellable: boolean }> {
    this.logger.log(`[SANDBOX] Checking status for UUID: ${uuid}, RFC: ${rfc}`);
    return { status: "Vigente", cancellable: true };
  }
}
