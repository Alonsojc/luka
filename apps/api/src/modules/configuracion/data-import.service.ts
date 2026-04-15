import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface ValidationResult {
  totalRows: number;
  validRows: number;
  errors: ValidationError[];
  warnings: ValidationError[];
  preview: Record<string, string>[];
}

interface ImportResult {
  importedRows: number;
  skippedRows: number;
  failedRows: number;
  errors: ValidationError[];
}

const EXPECTED_COLUMNS: Record<string, string[]> = {
  PRODUCTS: ["sku", "name", "category", "unit", "minStock", "maxStock", "price", "cost"],
  SUPPLIERS: ["rfc", "name", "contactName", "email", "phone", "address", "paymentTerms"],
  EMPLOYEES: [
    "employeeNumber",
    "firstName",
    "lastName",
    "curp",
    "rfc",
    "nss",
    "hireDate",
    "position",
    "department",
    "dailySalary",
    "bankAccount",
    "clabe",
  ],
  INVENTORY: ["sku", "quantity", "minStock", "maxStock"],
  CUSTOMERS: ["name", "rfc", "email", "phone", "address"],
};

const REQUIRED_COLUMNS: Record<string, string[]> = {
  PRODUCTS: ["sku", "name"],
  SUPPLIERS: ["name"],
  EMPLOYEES: ["employeeNumber", "firstName", "lastName", "hireDate", "position", "dailySalary"],
  INVENTORY: ["sku", "quantity"],
  CUSTOMERS: ["name"],
};

@Injectable()
export class DataImportService {
  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // CSV parsing helpers
  // ---------------------------------------------------------------------------

  private parseCsv(csvContent: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = csvContent
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      throw new BadRequestException("El archivo CSV esta vacio");
    }

    const headers = this.parseCsvLine(lines[0]).map((h) => h.trim());
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = (values[idx] || "").trim();
      });
      rows.push(row);
    }

    return { headers, rows };
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          result.push(current);
          current = "";
        } else {
          current += char;
        }
      }
    }
    result.push(current);
    return result;
  }

  private applyMappings(
    rows: Record<string, string>[],
    headers: string[],
    mappings: Record<string, string>,
  ): { mappedHeaders: string[]; mappedRows: Record<string, string>[] } {
    if (!mappings || Object.keys(mappings).length === 0) {
      return { mappedHeaders: headers, mappedRows: rows };
    }

    const mappedHeaders = headers.map((h) => mappings[h] || h);
    const mappedRows = rows.map((row) => {
      const mapped: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        const mappedKey = mappings[key] || key;
        mapped[mappedKey] = value;
      }
      return mapped;
    });

    return { mappedHeaders, mappedRows };
  }

  // ---------------------------------------------------------------------------
  // Validate CSV
  // ---------------------------------------------------------------------------

  async validateCsv(
    orgId: string,
    importType: string,
    csvContent: string,
  ): Promise<ValidationResult> {
    const expectedCols = EXPECTED_COLUMNS[importType];
    if (!expectedCols) {
      throw new BadRequestException(`Tipo de importacion no valido: ${importType}`);
    }

    const requiredCols = REQUIRED_COLUMNS[importType];
    const { headers, rows } = this.parseCsv(csvContent);
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check for required columns
    for (const col of requiredCols) {
      if (!headers.includes(col)) {
        errors.push({ row: 0, field: col, message: `Columna requerida "${col}" no encontrada` });
      }
    }

    // Warn about unexpected columns
    for (const header of headers) {
      if (!expectedCols.includes(header)) {
        warnings.push({
          row: 0,
          field: header,
          message: `Columna "${header}" no es esperada y sera ignorada`,
        });
      }
    }

    // Validate each row
    let validRows = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 because row 1 is headers, data starts at 2
      let rowValid = true;

      // Check required fields have values
      for (const col of requiredCols) {
        if (headers.includes(col) && !row[col]?.trim()) {
          errors.push({ row: rowNum, field: col, message: `Campo requerido "${col}" vacio` });
          rowValid = false;
        }
      }

      // Type-specific validations
      if (importType === "PRODUCTS") {
        if (row.price && isNaN(Number(row.price))) {
          errors.push({ row: rowNum, field: "price", message: "Precio debe ser un numero" });
          rowValid = false;
        }
        if (row.cost && isNaN(Number(row.cost))) {
          errors.push({ row: rowNum, field: "cost", message: "Costo debe ser un numero" });
          rowValid = false;
        }
      }

      if (importType === "EMPLOYEES") {
        if (row.dailySalary && isNaN(Number(row.dailySalary))) {
          errors.push({
            row: rowNum,
            field: "dailySalary",
            message: "Salario diario debe ser un numero",
          });
          rowValid = false;
        }
        if (row.hireDate && isNaN(Date.parse(row.hireDate))) {
          errors.push({
            row: rowNum,
            field: "hireDate",
            message: "Fecha de contratacion no valida (usar YYYY-MM-DD)",
          });
          rowValid = false;
        }
      }

      if (importType === "INVENTORY") {
        if (row.quantity && isNaN(Number(row.quantity))) {
          errors.push({ row: rowNum, field: "quantity", message: "Cantidad debe ser un numero" });
          rowValid = false;
        }
      }

      if (rowValid) validRows++;
    }

    const preview = rows.slice(0, 5);

    return {
      totalRows: rows.length,
      validRows,
      errors,
      warnings,
      preview,
    };
  }

  // ---------------------------------------------------------------------------
  // Import Products
  // ---------------------------------------------------------------------------

  async importProducts(
    orgId: string,
    userId: string,
    csvContent: string,
    mappings: Record<string, string> = {},
  ): Promise<ImportResult> {
    const { headers, rows } = this.parseCsv(csvContent);
    const { mappedRows } = this.applyMappings(rows, headers, mappings);
    const errors: ValidationError[] = [];
    let importedRows = 0;
    let skippedRows = 0;
    let failedRows = 0;

    const importRecord = await this.prisma.dataImport.create({
      data: {
        organizationId: orgId,
        importType: "PRODUCTS",
        fileName: "products_import.csv",
        status: "IMPORTING",
        totalRows: mappedRows.length,
        mappings: mappings || {},
        createdById: userId,
      },
    });

    for (let i = 0; i < mappedRows.length; i++) {
      const row = mappedRows[i];
      const rowNum = i + 2;

      try {
        if (!row.sku || !row.name) {
          skippedRows++;
          errors.push({ row: rowNum, field: "sku/name", message: "SKU y nombre son requeridos" });
          continue;
        }

        // Find or create category
        let categoryId: string | null = null;
        if (row.category?.trim()) {
          const category = await this.prisma.productCategory.upsert({
            where: {
              organizationId_name: { organizationId: orgId, name: row.category.trim() },
            },
            update: {},
            create: { organizationId: orgId, name: row.category.trim() },
          });
          categoryId = category.id;
        }

        await this.prisma.product.upsert({
          where: {
            organizationId_sku: { organizationId: orgId, sku: row.sku.trim() },
          },
          update: {
            name: row.name.trim(),
            categoryId,
            unitOfMeasure: row.unit?.trim() || "pza",
            costPerUnit: row.cost ? Number(row.cost) : undefined,
            isActive: true,
          },
          create: {
            organizationId: orgId,
            sku: row.sku.trim(),
            name: row.name.trim(),
            categoryId,
            unitOfMeasure: row.unit?.trim() || "pza",
            costPerUnit: row.cost ? Number(row.cost) : 0,
            isActive: true,
          },
        });

        importedRows++;
      } catch (err) {
        failedRows++;
        errors.push({
          row: rowNum,
          field: "general",
          message: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    }

    await this.prisma.dataImport.update({
      where: { id: importRecord.id },
      data: {
        status: failedRows === mappedRows.length ? "FAILED" : "COMPLETED",
        validRows: importedRows + skippedRows,
        importedRows,
        skippedRows,
        failedRows,
        errors,
        completedAt: new Date(),
      },
    });

    return { importedRows, skippedRows, failedRows, errors };
  }

  // ---------------------------------------------------------------------------
  // Import Suppliers
  // ---------------------------------------------------------------------------

  async importSuppliers(orgId: string, userId: string, csvContent: string): Promise<ImportResult> {
    const { rows } = this.parseCsv(csvContent);
    const errors: ValidationError[] = [];
    let importedRows = 0;
    let skippedRows = 0;
    let failedRows = 0;

    const importRecord = await this.prisma.dataImport.create({
      data: {
        organizationId: orgId,
        importType: "SUPPLIERS",
        fileName: "suppliers_import.csv",
        status: "IMPORTING",
        totalRows: rows.length,
        createdById: userId,
      },
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        if (!row.name?.trim()) {
          skippedRows++;
          errors.push({ row: rowNum, field: "name", message: "Nombre es requerido" });
          continue;
        }

        const rfc = row.rfc?.trim() || null;

        // If RFC exists, upsert by org + name (no unique RFC constraint on supplier)
        // Look for existing supplier with same RFC or name
        const existing = rfc
          ? await this.prisma.supplier.findFirst({
              where: { organizationId: orgId, rfc },
            })
          : await this.prisma.supplier.findFirst({
              where: { organizationId: orgId, name: row.name.trim() },
            });

        const data = {
          name: row.name.trim(),
          rfc,
          contactName: row.contactName?.trim() || null,
          email: row.email?.trim() || null,
          phone: row.phone?.trim() || null,
          address: row.address?.trim() || null,
          paymentTermsDays: row.paymentTerms ? parseInt(row.paymentTerms, 10) || 30 : 30,
          isActive: true,
        };

        if (existing) {
          await this.prisma.supplier.update({
            where: { id: existing.id },
            data,
          });
        } else {
          await this.prisma.supplier.create({
            data: { ...data, organizationId: orgId },
          });
        }

        importedRows++;
      } catch (err) {
        failedRows++;
        errors.push({
          row: rowNum,
          field: "general",
          message: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    }

    await this.prisma.dataImport.update({
      where: { id: importRecord.id },
      data: {
        status: failedRows === rows.length ? "FAILED" : "COMPLETED",
        validRows: importedRows + skippedRows,
        importedRows,
        skippedRows,
        failedRows,
        errors,
        completedAt: new Date(),
      },
    });

    return { importedRows, skippedRows, failedRows, errors };
  }

  // ---------------------------------------------------------------------------
  // Import Employees
  // ---------------------------------------------------------------------------

  async importEmployees(
    orgId: string,
    userId: string,
    csvContent: string,
    branchId: string,
  ): Promise<ImportResult> {
    if (!branchId) {
      throw new BadRequestException("Se requiere seleccionar una sucursal para importar empleados");
    }

    // Verify branch belongs to org
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organization: { id: orgId } },
    });
    if (!branch) {
      throw new BadRequestException("Sucursal no encontrada");
    }

    const { rows } = this.parseCsv(csvContent);
    const errors: ValidationError[] = [];
    let importedRows = 0;
    let skippedRows = 0;
    let failedRows = 0;

    const importRecord = await this.prisma.dataImport.create({
      data: {
        organizationId: orgId,
        importType: "EMPLOYEES",
        fileName: "employees_import.csv",
        status: "IMPORTING",
        totalRows: rows.length,
        createdById: userId,
      },
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        if (!row.employeeNumber?.trim() || !row.firstName?.trim() || !row.lastName?.trim()) {
          skippedRows++;
          errors.push({
            row: rowNum,
            field: "employeeNumber/firstName/lastName",
            message: "Numero de empleado, nombre y apellido son requeridos",
          });
          continue;
        }

        const dailySalary = Number(row.dailySalary) || 0;
        const hireDate = row.hireDate ? new Date(row.hireDate) : new Date();

        if (isNaN(hireDate.getTime())) {
          skippedRows++;
          errors.push({
            row: rowNum,
            field: "hireDate",
            message: "Fecha de contratacion no valida",
          });
          continue;
        }

        await this.prisma.employee.upsert({
          where: {
            organizationId_employeeNumber: {
              organizationId: orgId,
              employeeNumber: row.employeeNumber.trim(),
            },
          },
          update: {
            firstName: row.firstName.trim(),
            lastName: row.lastName.trim(),
            curp: row.curp?.trim() || null,
            rfc: row.rfc?.trim() || null,
            nss: row.nss?.trim() || null,
            hireDate,
            jobPosition: row.position?.trim() || "General",
            department: row.department?.trim() || null,
            dailySalary,
            bankAccount: row.bankAccount?.trim() || null,
            clabe: row.clabe?.trim() || null,
            branchId,
            isActive: true,
          },
          create: {
            organizationId: orgId,
            branchId,
            employeeNumber: row.employeeNumber.trim(),
            firstName: row.firstName.trim(),
            lastName: row.lastName.trim(),
            curp: row.curp?.trim() || null,
            rfc: row.rfc?.trim() || null,
            nss: row.nss?.trim() || null,
            hireDate,
            jobPosition: row.position?.trim() || "General",
            department: row.department?.trim() || null,
            dailySalary,
            bankAccount: row.bankAccount?.trim() || null,
            clabe: row.clabe?.trim() || null,
            isActive: true,
          },
        });

        importedRows++;
      } catch (err) {
        failedRows++;
        errors.push({
          row: rowNum,
          field: "general",
          message: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    }

    await this.prisma.dataImport.update({
      where: { id: importRecord.id },
      data: {
        status: failedRows === rows.length ? "FAILED" : "COMPLETED",
        validRows: importedRows + skippedRows,
        importedRows,
        skippedRows,
        failedRows,
        errors,
        completedAt: new Date(),
      },
    });

    return { importedRows, skippedRows, failedRows, errors };
  }

  // ---------------------------------------------------------------------------
  // Import Inventory
  // ---------------------------------------------------------------------------

  async importInventory(
    orgId: string,
    userId: string,
    csvContent: string,
    branchId: string,
  ): Promise<ImportResult> {
    if (!branchId) {
      throw new BadRequestException(
        "Se requiere seleccionar una sucursal para importar inventario",
      );
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organization: { id: orgId } },
    });
    if (!branch) {
      throw new BadRequestException("Sucursal no encontrada");
    }

    const { rows } = this.parseCsv(csvContent);
    const errors: ValidationError[] = [];
    let importedRows = 0;
    let skippedRows = 0;
    let failedRows = 0;

    const importRecord = await this.prisma.dataImport.create({
      data: {
        organizationId: orgId,
        importType: "INVENTORY",
        fileName: "inventory_import.csv",
        status: "IMPORTING",
        totalRows: rows.length,
        createdById: userId,
      },
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        if (!row.sku?.trim()) {
          skippedRows++;
          errors.push({ row: rowNum, field: "sku", message: "SKU es requerido" });
          continue;
        }

        const quantity = Number(row.quantity);
        if (isNaN(quantity)) {
          skippedRows++;
          errors.push({ row: rowNum, field: "quantity", message: "Cantidad debe ser un numero" });
          continue;
        }

        // Find product by SKU
        const product = await this.prisma.product.findFirst({
          where: { organizationId: orgId, sku: row.sku.trim() },
        });

        if (!product) {
          skippedRows++;
          errors.push({
            row: rowNum,
            field: "sku",
            message: `Producto con SKU "${row.sku}" no encontrado`,
          });
          continue;
        }

        const minStock = row.minStock ? Number(row.minStock) : 0;
        const maxStock = row.maxStock ? Number(row.maxStock) : undefined;

        await this.prisma.branchInventory.upsert({
          where: {
            branchId_productId: { branchId, productId: product.id },
          },
          update: {
            currentQuantity: quantity,
            minimumStock: isNaN(minStock) ? 0 : minStock,
          },
          create: {
            branchId,
            productId: product.id,
            currentQuantity: quantity,
            minimumStock: isNaN(minStock) ? 0 : minStock,
          },
        });

        importedRows++;
      } catch (err) {
        failedRows++;
        errors.push({
          row: rowNum,
          field: "general",
          message: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    }

    await this.prisma.dataImport.update({
      where: { id: importRecord.id },
      data: {
        status: failedRows === rows.length ? "FAILED" : "COMPLETED",
        validRows: importedRows + skippedRows,
        importedRows,
        skippedRows,
        failedRows,
        errors,
        completedAt: new Date(),
      },
    });

    return { importedRows, skippedRows, failedRows, errors };
  }

  // ---------------------------------------------------------------------------
  // Import Customers
  // ---------------------------------------------------------------------------

  async importCustomers(orgId: string, userId: string, csvContent: string): Promise<ImportResult> {
    const { rows } = this.parseCsv(csvContent);
    const errors: ValidationError[] = [];
    let importedRows = 0;
    let skippedRows = 0;
    let failedRows = 0;

    const importRecord = await this.prisma.dataImport.create({
      data: {
        organizationId: orgId,
        importType: "CUSTOMERS",
        fileName: "customers_import.csv",
        status: "IMPORTING",
        totalRows: rows.length,
        createdById: userId,
      },
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        if (!row.name?.trim()) {
          skippedRows++;
          errors.push({ row: rowNum, field: "name", message: "Nombre es requerido" });
          continue;
        }

        const rfc = row.rfc?.trim() || null;
        const email = row.email?.trim() || null;

        // Try to find existing customer by RFC or email
        let existingId: string | null = null;
        if (rfc) {
          const found = await this.prisma.customer.findFirst({
            where: { organizationId: orgId, rfc },
            select: { id: true },
          });
          if (found) existingId = found.id;
        }
        if (!existingId && email) {
          const found = await this.prisma.customer.findFirst({
            where: { organizationId: orgId, email },
            select: { id: true },
          });
          if (found) existingId = found.id;
        }

        const data = {
          name: row.name.trim(),
          rfc,
          email,
          phone: row.phone?.trim() || null,
        };

        if (existingId) {
          await this.prisma.customer.update({
            where: { id: existingId },
            data,
          });
        } else {
          await this.prisma.customer.create({
            data: { ...data, organizationId: orgId },
          });
        }

        importedRows++;
      } catch (err) {
        failedRows++;
        errors.push({
          row: rowNum,
          field: "general",
          message: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    }

    await this.prisma.dataImport.update({
      where: { id: importRecord.id },
      data: {
        status: failedRows === rows.length ? "FAILED" : "COMPLETED",
        validRows: importedRows + skippedRows,
        importedRows,
        skippedRows,
        failedRows,
        errors,
        completedAt: new Date(),
      },
    });

    return { importedRows, skippedRows, failedRows, errors };
  }

  // ---------------------------------------------------------------------------
  // History & Detail
  // ---------------------------------------------------------------------------

  async getImportHistory(orgId: string) {
    const data = await this.prisma.dataImport.findMany({
      where: { organizationId: orgId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return data;
  }

  async getImportDetail(orgId: string, id: string) {
    const record = await this.prisma.dataImport.findFirst({
      where: { id, organizationId: orgId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!record) {
      throw new BadRequestException("Registro de importacion no encontrado");
    }

    return record;
  }

  // ---------------------------------------------------------------------------
  // CSV Templates
  // ---------------------------------------------------------------------------

  getTemplate(importType: string): string {
    const columns = EXPECTED_COLUMNS[importType];
    if (!columns) {
      throw new BadRequestException(`Tipo de importacion no valido: ${importType}`);
    }
    return columns.join(",");
  }
}
