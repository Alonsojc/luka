import { Injectable, Logger } from "@nestjs/common";
import {
  PacProvider,
  PacStampResponse,
  PacCancelResponse,
} from "./pac.interface";
import { PacSandboxProvider } from "./pac-sandbox.provider";

@Injectable()
export class PacService {
  private readonly logger = new Logger(PacService.name);
  private provider: PacProvider;

  constructor() {
    const providerName = process.env.PAC_PROVIDER || "sandbox";

    // For now, always use sandbox. Real providers (Finkok, SW Sapien, etc.)
    // will be added as additional PacProvider implementations.
    switch (providerName) {
      case "sandbox":
      default:
        this.provider = new PacSandboxProvider();
        break;
    }

    this.logger.log(`PAC provider initialized: ${this.provider.name}`);
  }

  get currentProvider(): string {
    return this.provider.name;
  }

  async stamp(xml: string, rfc: string): Promise<PacStampResponse> {
    return this.provider.stamp(xml, rfc);
  }

  async cancel(
    uuid: string,
    rfc: string,
    motivo: string,
    folioSustitucion?: string,
  ): Promise<PacCancelResponse> {
    return this.provider.cancel(uuid, rfc, motivo, folioSustitucion);
  }

  async getStatus(
    uuid: string,
    rfc: string,
  ): Promise<{ status: string; cancellable: boolean }> {
    return this.provider.getStatus(uuid, rfc);
  }
}
