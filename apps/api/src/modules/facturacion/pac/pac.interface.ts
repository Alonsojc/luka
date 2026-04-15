export interface PacStampResponse {
  uuid: string;
  sello: string;
  noCertificadoSAT: string;
  cadenaOriginal: string;
  fechaTimbrado: string;
  xmlTimbrado: string;
}

export interface PacCancelResponse {
  success: boolean;
  acuse: string; // XML acuse de cancelacion
  fechaCancelacion: string;
}

export interface PacProvider {
  name: string;
  stamp(xml: string, rfc: string): Promise<PacStampResponse>;
  cancel(
    uuid: string,
    rfc: string,
    motivo: string,
    folioSustitucion?: string,
  ): Promise<PacCancelResponse>;
  getStatus(uuid: string, rfc: string): Promise<{ status: string; cancellable: boolean }>;
}
