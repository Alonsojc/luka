import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

interface SatXmlResult {
  xml: string;
  filename: string;
}

@Injectable()
export class SatXmlService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate Catalogo de Cuentas XML per SAT Anexo 24 (CatalogoCuentas 1.3).
   */
  async generateCatalogoCuentas(
    organizationId: string,
    year: number,
    month: number,
  ): Promise<SatXmlResult> {
    const rfc = await this.getOrganizationRfc(organizationId);

    const accounts = await this.prisma.accountCatalog.findMany({
      where: { organizationId, isActive: true },
      orderBy: { code: "asc" },
    });

    const mes = String(month).padStart(2, "0");
    const anio = String(year);

    const accountLines = accounts
      .map((account) => {
        const nature = account.nature === "DEBIT" ? "D" : "A";
        const level = this.calculateLevel(account.code);
        const codAgrup = account.satGroupCode || "";

        return (
          `  <catalogocuentas:Ctas ` +
          `CodAgrup="${this.escapeXml(codAgrup)}" ` +
          `NumCta="${this.escapeXml(account.code)}" ` +
          `Desc="${this.escapeXml(account.name)}" ` +
          `Nivel="${level}" ` +
          `Natur="${nature}" />`
        );
      })
      .join("\n");

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<catalogocuentas:Catalogo \n` +
      `  xmlns:catalogocuentas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas"\n` +
      `  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n` +
      `  Version="1.3"\n` +
      `  RFC="${this.escapeXml(rfc)}"\n` +
      `  Mes="${mes}"\n` +
      `  Anio="${anio}"\n` +
      `  TotalCtas="${accounts.length}">\n` +
      accountLines +
      `\n</catalogocuentas:Catalogo>`;

    const filename = `CatalogoCuentas_${rfc}_${anio}${mes}.xml`;

    return { xml, filename };
  }

  /**
   * Generate Balanza de Comprobacion XML per SAT Anexo 24 (BalanzaComprobacion 1.3).
   */
  async generateBalanzaComprobacion(
    organizationId: string,
    year: number,
    month: number,
    tipoEnvio: "N" | "C" = "N",
  ): Promise<SatXmlResult> {
    const rfc = await this.getOrganizationRfc(organizationId);

    // Get all detail accounts
    const accounts = await this.prisma.accountCatalog.findMany({
      where: { organizationId, isActive: true, isDetail: true },
      orderBy: { code: "asc" },
    });

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const mes = String(month).padStart(2, "0");
    const anio = String(year);

    const accountLines: string[] = [];

    for (const account of accounts) {
      // Get journal entry lines for the current month (only POSTED entries)
      const currentMonthLines = await this.prisma.journalEntryLine.findMany({
        where: {
          accountId: account.id,
          journalEntry: {
            organizationId,
            status: "POSTED",
            entryDate: { gte: monthStart, lte: monthEnd },
          },
        },
      });

      // Sum debits and credits for the current month
      const totalDebits = currentMonthLines.reduce(
        (sum, line) => sum + Number(line.debit),
        0,
      );
      const totalCredits = currentMonthLines.reduce(
        (sum, line) => sum + Number(line.credit),
        0,
      );

      // Calculate initial balance from all prior posted entries
      const priorLines = await this.prisma.journalEntryLine.findMany({
        where: {
          accountId: account.id,
          journalEntry: {
            organizationId,
            status: "POSTED",
            entryDate: { lt: monthStart },
          },
        },
      });

      const priorDebits = priorLines.reduce(
        (sum, line) => sum + Number(line.debit),
        0,
      );
      const priorCredits = priorLines.reduce(
        (sum, line) => sum + Number(line.credit),
        0,
      );

      // Initial balance depends on account nature
      let initialBalance: number;
      if (account.nature === "DEBIT") {
        initialBalance = priorDebits - priorCredits;
      } else {
        initialBalance = priorCredits - priorDebits;
      }

      // Final balance calculation
      let finalBalance: number;
      if (account.nature === "DEBIT") {
        finalBalance = initialBalance + totalDebits - totalCredits;
      } else {
        finalBalance = initialBalance - totalDebits + totalCredits;
      }

      // Only include accounts with non-zero movement or balance
      if (
        totalDebits === 0 &&
        totalCredits === 0 &&
        initialBalance === 0 &&
        finalBalance === 0
      ) {
        continue;
      }

      accountLines.push(
        `  <BCE:Ctas ` +
          `NumCta="${this.escapeXml(account.code)}" ` +
          `SaldoIni="${this.formatDecimal(initialBalance)}" ` +
          `Debe="${this.formatDecimal(totalDebits)}" ` +
          `Haber="${this.formatDecimal(totalCredits)}" ` +
          `SaldoFin="${this.formatDecimal(finalBalance)}" />`,
      );
    }

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<BCE:Balanza \n` +
      `  xmlns:BCE="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion"\n` +
      `  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n` +
      `  Version="1.3"\n` +
      `  RFC="${this.escapeXml(rfc)}"\n` +
      `  Mes="${mes}"\n` +
      `  Anio="${anio}"\n` +
      `  TipoEnvio="${tipoEnvio}">\n` +
      accountLines.join("\n") +
      `\n</BCE:Balanza>`;

    const filename = `BalanzaComprobacion_${rfc}_${anio}${mes}.xml`;

    return { xml, filename };
  }

  // ── Private helpers ──

  /**
   * Get the RFC from the organization record.
   */
  private async getOrganizationRfc(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { rfc: true },
    });
    if (!org) {
      throw new NotFoundException("Organizacion no encontrada");
    }
    return org.rfc;
  }

  /**
   * Calculate account level from its code.
   * Count dots + 1, e.g. "1" = 1, "1.1" = 2, "1.1.1" = 3.
   */
  private calculateLevel(code: string): number {
    if (!code) return 1;
    const dots = (code.match(/\./g) || []).length;
    return dots + 1;
  }

  /**
   * Format a number with exactly 2 decimal places for SAT XML.
   */
  private formatDecimal(value: number): string {
    return value.toFixed(2);
  }

  /**
   * Escape special characters for XML attribute values.
   */
  private escapeXml(str: string): string {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
