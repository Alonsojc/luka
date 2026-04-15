import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

// ────────────────────────────────────────────────────────────
// Worky API client interface
// TODO: Replace mock implementation with real Worky API calls
//       once API credentials are available (worky.mx).
// ────────────────────────────────────────────────────────────

interface WorkyEmployee {
  workyId: string;
  firstName: string;
  lastName: string;
  curp: string;
  rfc: string;
  nss: string;
  hireDate: string;
  position: string;
  department: string;
  dailySalary: number;
  bankAccount?: string;
  clabe?: string;
  isActive: boolean;
}

// ────────────────────────────────────────────────────────────
// Mock Worky API adapter
// This generates sample data to simulate real API responses.
// Replace the body of fetchEmployeesFromWorky() with a real
// HTTP call when the Worky API integration is ready.
// ────────────────────────────────────────────────────────────

const MOCK_POSITIONS = [
  "Pokero",
  "Cajero",
  "Gerente de Sucursal",
  "Subgerente",
  "Repartidor",
  "Preparador",
  "Auxiliar de Cocina",
  "Limpieza",
];

const MOCK_DEPARTMENTS = [
  "Operaciones",
  "Cocina",
  "Atención al Cliente",
  "Administración",
  "Logística",
];

const MOCK_FIRST_NAMES = [
  "Carlos",
  "María",
  "José",
  "Ana",
  "Luis",
  "Sofía",
  "Miguel",
  "Fernanda",
  "Ricardo",
  "Valentina",
];

const MOCK_LAST_NAMES = [
  "García López",
  "Hernández Martínez",
  "López Rodríguez",
  "González Pérez",
  "Ramírez Sánchez",
  "Torres Flores",
  "Díaz Rivera",
  "Morales Cruz",
  "Reyes Gómez",
  "Jiménez Ortiz",
];

function generateMockRFC(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let rfc = "";
  for (let i = 0; i < 4; i++) rfc += letters[Math.floor(Math.random() * 26)];
  rfc += String(Math.floor(Math.random() * 900000) + 100000);
  for (let i = 0; i < 3; i++) rfc += letters[Math.floor(Math.random() * 26)];
  return rfc;
}

function generateMockCURP(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let curp = "";
  for (let i = 0; i < 4; i++) curp += letters[Math.floor(Math.random() * 26)];
  curp += String(Math.floor(Math.random() * 900000) + 100000);
  curp += "H";
  for (let i = 0; i < 5; i++) curp += letters[Math.floor(Math.random() * 26)];
  curp += String(Math.floor(Math.random() * 90) + 10);
  return curp;
}

function generateMockNSS(): string {
  let nss = "";
  for (let i = 0; i < 11; i++) nss += String(Math.floor(Math.random() * 10));
  return nss;
}

/**
 * Mock: Simulates fetching employees from Worky API.
 * Replace this function body with a real HTTP call to Worky.
 */
function fetchEmployeesFromWorky(_apiKey: string, _companyId: string): WorkyEmployee[] {
  const count = Math.floor(Math.random() * 6) + 5; // 5-10 employees
  const employees: WorkyEmployee[] = [];

  for (let i = 0; i < count; i++) {
    const firstName = MOCK_FIRST_NAMES[i % MOCK_FIRST_NAMES.length];
    const lastName = MOCK_LAST_NAMES[i % MOCK_LAST_NAMES.length];
    const year = 2020 + Math.floor(Math.random() * 5);
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");

    employees.push({
      workyId: `WK-${String(i + 1).padStart(4, "0")}`,
      firstName,
      lastName,
      curp: generateMockCURP(),
      rfc: generateMockRFC(),
      nss: generateMockNSS(),
      hireDate: `${year}-${month}-${day}`,
      position: MOCK_POSITIONS[i % MOCK_POSITIONS.length],
      department: MOCK_DEPARTMENTS[i % MOCK_DEPARTMENTS.length],
      dailySalary: Math.round((200 + Math.random() * 600) * 100) / 100,
      bankAccount:
        i % 3 === 0 ? String(Math.floor(Math.random() * 9000000000) + 1000000000) : undefined,
      clabe:
        i % 4 === 0
          ? String(Math.floor(Math.random() * 900000000000000000) + 100000000000000000)
          : undefined,
      isActive: i < count - 1, // last one is inactive for testing
    });
  }

  return employees;
}

@Injectable()
export class WorkyService {
  constructor(private prisma: PrismaService) {}

  // ── Configuration ──────────────────────────────────────────

  async getConfig(organizationId: string) {
    const config = await this.prisma.workyConfig.findUnique({
      where: { organizationId },
    });
    if (!config) {
      // Return a default/empty config so the frontend can render the form
      return {
        id: null,
        organizationId,
        apiKey: null,
        companyId: null,
        isActive: false,
        lastSyncAt: null,
        syncFrequency: "MANUAL",
      };
    }
    // Mask the API key for security
    return {
      ...config,
      apiKey: config.apiKey ? "••••••••" + config.apiKey.slice(-4) : null,
    };
  }

  async saveConfig(
    organizationId: string,
    data: { apiKey?: string; companyId?: string; syncFrequency?: string },
  ) {
    const updateData: any = {};
    if (data.companyId !== undefined) updateData.companyId = data.companyId;
    if (data.syncFrequency !== undefined) updateData.syncFrequency = data.syncFrequency;
    // Only update apiKey if a new one is provided (not the masked value)
    if (data.apiKey && !data.apiKey.startsWith("••••")) {
      updateData.apiKey = data.apiKey;
    }

    return this.prisma.workyConfig.upsert({
      where: { organizationId },
      create: {
        organizationId,
        apiKey: data.apiKey || null,
        companyId: data.companyId || null,
        syncFrequency: data.syncFrequency || "MANUAL",
        isActive: true,
      },
      update: {
        ...updateData,
        isActive: true,
      },
    });
  }

  // ── Test Connection ────────────────────────────────────────

  /**
   * Mock: Tests connection to Worky API.
   * Returns success if apiKey is configured.
   * TODO: Replace with a real API health-check call.
   */
  async testConnection(organizationId: string) {
    const config = await this.prisma.workyConfig.findUnique({
      where: { organizationId },
    });

    if (!config || !config.apiKey) {
      return {
        success: false,
        message: "No se ha configurado la API Key de Worky",
      };
    }

    // Mock: simulate a successful connection test
    return {
      success: true,
      message: "Conexión exitosa con Worky",
      companyName: "Poke Chain S.A. de C.V. (mock)",
      employeeCount: Math.floor(Math.random() * 50) + 10,
    };
  }

  // ── Employee Sync ──────────────────────────────────────────

  async syncEmployees(organizationId: string) {
    const config = await this.prisma.workyConfig.findUnique({
      where: { organizationId },
    });

    if (!config || !config.apiKey) {
      throw new BadRequestException("Worky no está configurado. Configura la API Key primero.");
    }

    // Get branches to assign employees (use the first active branch as default)
    const branches = await this.prisma.branch.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: "asc" },
    });

    if (branches.length === 0) {
      throw new BadRequestException("No hay sucursales activas. Crea al menos una sucursal.");
    }

    const defaultBranchId = branches[0].id;

    // Create sync log
    const syncLog = await this.prisma.workySyncLog.create({
      data: {
        organizationId,
        workyConfigId: config.id,
        syncType: "EMPLOYEES",
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });

    const errors: Array<{ employee: string; error: string }> = [];
    let created = 0;
    let updated = 0;
    const skipped = 0;
    let failed = 0;

    try {
      // Fetch employees from Worky (mock)
      const workyEmployees = fetchEmployeesFromWorky(config.apiKey, config.companyId || "");

      for (const we of workyEmployees) {
        try {
          // Try to match by RFC or CURP
          const existing = await this.prisma.employee.findFirst({
            where: {
              organizationId,
              OR: [...(we.rfc ? [{ rfc: we.rfc }] : []), ...(we.curp ? [{ curp: we.curp }] : [])],
            },
          });

          if (existing) {
            // Update existing employee
            await this.prisma.employee.update({
              where: { id: existing.id },
              data: {
                jobPosition: we.position,
                department: we.department,
                dailySalary: we.dailySalary,
                isActive: we.isActive,
                ...(we.bankAccount && { bankAccount: we.bankAccount }),
                ...(we.clabe && { clabe: we.clabe }),
              },
            });
            updated++;
          } else {
            // Generate employee number
            const empCount = await this.prisma.employee.count({
              where: { organizationId },
            });
            const employeeNumber = `WK-${String(empCount + created + 1).padStart(4, "0")}`;

            // Create new employee
            await this.prisma.employee.create({
              data: {
                organizationId,
                branchId: defaultBranchId,
                employeeNumber,
                firstName: we.firstName,
                lastName: we.lastName,
                curp: we.curp || undefined,
                rfc: we.rfc || undefined,
                nss: we.nss || undefined,
                hireDate: new Date(we.hireDate),
                jobPosition: we.position,
                department: we.department,
                dailySalary: we.dailySalary,
                bankAccount: we.bankAccount || undefined,
                clabe: we.clabe || undefined,
                isActive: we.isActive,
              },
            });
            created++;
          }
        } catch (err: any) {
          failed++;
          errors.push({
            employee: `${we.firstName} ${we.lastName}`,
            error: err.message || "Error desconocido",
          });
        }
      }

      // Update sync log with results
      await this.prisma.workySyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: failed > 0 && created === 0 && updated === 0 ? "FAILED" : "COMPLETED",
          totalRecords: workyEmployees.length,
          created,
          updated,
          skipped,
          failed,
          errors: errors as any,
          completedAt: new Date(),
        },
      });

      // Update last sync timestamp
      await this.prisma.workyConfig.update({
        where: { id: config.id },
        data: { lastSyncAt: new Date() },
      });
    } catch (err: any) {
      // Global failure
      await this.prisma.workySyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: "FAILED",
          errors: [{ employee: "General", error: err.message }] as any,
          completedAt: new Date(),
        },
      });
      throw err;
    }

    return {
      syncLogId: syncLog.id,
      totalRecords: created + updated + skipped + failed,
      created,
      updated,
      skipped,
      failed,
      errors,
    };
  }

  // ── CSV Import ─────────────────────────────────────────────

  async importFromCsv(organizationId: string, csvContent: string, branchId: string) {
    // Verify the branch belongs to this organization
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId },
    });
    if (!branch) {
      throw new NotFoundException("Sucursal no encontrada");
    }

    // Get or create a WorkyConfig for the sync log
    let config = await this.prisma.workyConfig.findUnique({
      where: { organizationId },
    });
    if (!config) {
      config = await this.prisma.workyConfig.create({
        data: { organizationId, syncFrequency: "MANUAL" },
      });
    }

    // Create sync log
    const syncLog = await this.prisma.workySyncLog.create({
      data: {
        organizationId,
        workyConfigId: config.id,
        syncType: "EMPLOYEES",
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });

    const errors: Array<{ row: number; employee: string; error: string }> = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const lines = csvContent.trim().split("\n");
      if (lines.length < 2) {
        throw new BadRequestException(
          "El CSV debe tener al menos un encabezado y una fila de datos",
        );
      }

      // Parse header
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const requiredHeaders = [
        "employeenumber",
        "firstname",
        "lastname",
        "hiredate",
        "dailysalary",
      ];
      const missingHeaders = requiredHeaders.filter((rh) => !headers.includes(rh));
      if (missingHeaders.length > 0) {
        throw new BadRequestException(
          `Columnas requeridas faltantes: ${missingHeaders.join(", ")}`,
        );
      }

      // Parse rows
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
          skipped++;
          continue;
        }

        const values = line.split(",").map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || "";
        });

        const employeeName = `${row.firstname || ""} ${row.lastname || ""}`.trim();

        try {
          if (!row.employeenumber || !row.firstname || !row.lastname) {
            skipped++;
            errors.push({
              row: i + 1,
              employee: employeeName || `Fila ${i + 1}`,
              error: "Faltan campos requeridos (employeeNumber, firstName, lastName)",
            });
            continue;
          }

          // Upsert by employeeNumber
          const existing = await this.prisma.employee.findFirst({
            where: {
              organizationId,
              employeeNumber: row.employeenumber,
            },
          });

          const dailySalary = parseFloat(row.dailysalary || "0");
          if (isNaN(dailySalary) || dailySalary <= 0) {
            failed++;
            errors.push({
              row: i + 1,
              employee: employeeName,
              error: "Salario diario inválido",
            });
            continue;
          }

          if (existing) {
            await this.prisma.employee.update({
              where: { id: existing.id },
              data: {
                jobPosition: row.position || row.jobposition || existing.jobPosition,
                department: row.department || existing.department,
                dailySalary,
                ...(row.bankaccount && { bankAccount: row.bankaccount }),
                ...(row.clabe && { clabe: row.clabe }),
              },
            });
            updated++;
          } else {
            await this.prisma.employee.create({
              data: {
                organizationId,
                branchId,
                employeeNumber: row.employeenumber,
                firstName: row.firstname,
                lastName: row.lastname,
                curp: row.curp || undefined,
                rfc: row.rfc || undefined,
                nss: row.nss || undefined,
                hireDate: new Date(row.hiredate),
                jobPosition: row.position || row.jobposition || "Sin puesto",
                department: row.department || undefined,
                dailySalary,
                bankAccount: row.bankaccount || undefined,
                clabe: row.clabe || undefined,
              },
            });
            created++;
          }
        } catch (err: any) {
          failed++;
          errors.push({
            row: i + 1,
            employee: employeeName,
            error: err.message || "Error desconocido",
          });
        }
      }

      // Update sync log
      await this.prisma.workySyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: failed > 0 && created === 0 && updated === 0 ? "FAILED" : "COMPLETED",
          totalRecords: lines.length - 1,
          created,
          updated,
          skipped,
          failed,
          errors: errors as any,
          completedAt: new Date(),
        },
      });
    } catch (err: any) {
      await this.prisma.workySyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: "FAILED",
          errors: [{ row: 0, employee: "General", error: err.message }] as any,
          completedAt: new Date(),
        },
      });
      throw err;
    }

    return {
      syncLogId: syncLog.id,
      totalRecords: created + updated + skipped + failed,
      created,
      updated,
      skipped,
      failed,
      errors,
    };
  }

  // ── Sync History ───────────────────────────────────────────

  async getSyncHistory(organizationId: string) {
    return this.prisma.workySyncLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async getSyncDetail(organizationId: string, logId: string) {
    const log = await this.prisma.workySyncLog.findFirst({
      where: { id: logId, organizationId },
    });
    if (!log) {
      throw new NotFoundException("Registro de sincronización no encontrado");
    }
    return log;
  }
}
