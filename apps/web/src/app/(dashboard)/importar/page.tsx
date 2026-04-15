"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Upload,
  FileText,
  Package,
  Users,
  Truck,
  ShoppingCart,
  Warehouse,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Download,
  ArrowLeft,
  ArrowRight,
  History,
  FileDown,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface DataImportRecord {
  id: string;
  importType: string;
  fileName: string;
  status: string;
  totalRows: number;
  validRows: number;
  importedRows: number;
  skippedRows: number;
  failedRows: number;
  errors: ValidationError[];
  createdBy: { id: string; firstName: string; lastName: string };
  createdAt: string;
  completedAt: string | null;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMPORT_TYPES = [
  {
    key: "PRODUCTS",
    label: "Productos",
    icon: Package,
    description: "SKU, nombre, categoria, unidad, precios",
    needsBranch: false,
  },
  {
    key: "SUPPLIERS",
    label: "Proveedores",
    icon: Truck,
    description: "RFC, nombre, contacto, email, telefono",
    needsBranch: false,
  },
  {
    key: "EMPLOYEES",
    label: "Empleados",
    icon: Users,
    description: "Numero, nombre, CURP, RFC, salario",
    needsBranch: true,
  },
  {
    key: "INVENTORY",
    label: "Inventario",
    icon: Warehouse,
    description: "SKU, cantidad, stock minimo y maximo",
    needsBranch: true,
  },
  {
    key: "CUSTOMERS",
    label: "Clientes",
    icon: ShoppingCart,
    description: "Nombre, RFC, email, telefono",
    needsBranch: false,
  },
];

const COLUMN_HINTS: Record<string, string> = {
  PRODUCTS: "sku, name, category, unit, minStock, maxStock, price, cost",
  SUPPLIERS: "rfc, name, contactName, email, phone, address, paymentTerms",
  EMPLOYEES:
    "employeeNumber, firstName, lastName, curp, rfc, nss, hireDate, position, department, dailySalary, bankAccount, clabe",
  INVENTORY: "sku, quantity, minStock, maxStock",
  CUSTOMERS: "name, rfc, email, phone, address",
};

const STATUS_MAP: Record<string, { label: string; variant: string }> = {
  PENDING: { label: "Pendiente", variant: "gray" },
  VALIDATING: { label: "Validando", variant: "blue" },
  VALIDATED: { label: "Validado", variant: "blue" },
  IMPORTING: { label: "Importando", variant: "yellow" },
  COMPLETED: { label: "Completado", variant: "green" },
  FAILED: { label: "Fallido", variant: "red" },
};

const TYPE_LABELS: Record<string, string> = {
  PRODUCTS: "Productos",
  SUPPLIERS: "Proveedores",
  EMPLOYEES: "Empleados",
  INVENTORY: "Inventario",
  CUSTOMERS: "Clientes",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImportarPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"importar" | "plantillas" | "historial">("importar");

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [csvContent, setCsvContent] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);

  // History state
  const [history, setHistory] = useState<DataImportRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchBranches = useCallback(async () => {
    try {
      const data = await authFetch<Branch[]>("get", "/branches");
      setBranches(data);
    } catch {
      // silent
    }
  }, [authFetch]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await authFetch<DataImportRecord[]>("get", "/configuracion/import/history");
      setHistory(data);
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (!authLoading) {
      fetchBranches();
    }
  }, [authLoading, fetchBranches]);

  useEffect(() => {
    if (activeTab === "historial" && !authLoading) {
      fetchHistory();
    }
  }, [activeTab, authLoading, fetchHistory]);

  // ---------------------------------------------------------------------------
  // Wizard handlers
  // ---------------------------------------------------------------------------

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvContent(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleValidate = async () => {
    if (!selectedType || !csvContent.trim()) return;
    setValidating(true);
    try {
      const result = await authFetch<ValidationResult>("post", "/configuracion/import/validate", {
        importType: selectedType,
        csvContent,
      });
      setValidationResult(result);
      setCurrentStep(3);
    } catch {
      setValidationResult(null);
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!selectedType || !csvContent.trim()) return;
    setImporting(true);
    try {
      const typeConfig = IMPORT_TYPES.find((t) => t.key === selectedType);
      const body: Record<string, unknown> = {
        importType: selectedType,
        csvContent,
      };
      if (typeConfig?.needsBranch) {
        body.branchId = selectedBranch;
      }
      const result = await authFetch<ImportResult>("post", "/configuracion/import/execute", body);
      setImportResult(result);
      setCurrentStep(5);
    } catch {
      // silent
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async (type: string) => {
    try {
      const result = await authFetch<{ csv: string }>(
        "get",
        `/configuracion/import/template/${type}`,
      );
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plantilla_${type.toLowerCase()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent
    }
  };

  const handleDownloadErrors = (errors: ValidationError[]) => {
    const csvLines = ["row,field,message"];
    errors.forEach((err) => {
      csvLines.push(`${err.row},"${err.field}","${err.message.replace(/"/g, '""')}"`);
    });
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "errores_importacion.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetWizard = () => {
    setCurrentStep(1);
    setSelectedType(null);
    setCsvContent("");
    setValidationResult(null);
    setImportResult(null);
    setSelectedBranch("");
  };

  const needsBranch = IMPORT_TYPES.find((t) => t.key === selectedType)?.needsBranch ?? false;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importar Datos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Importa datos desde CSV para migrar desde PoloSW u otros sistemas
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {[
            { key: "importar" as const, label: "Importar Datos", icon: Upload },
            {
              key: "plantillas" as const,
              label: "Plantillas",
              icon: FileDown,
            },
            { key: "historial" as const, label: "Historial", icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "border-black text-black"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ================================================================== */}
      {/* TAB: Importar Datos */}
      {/* ================================================================== */}
      {activeTab === "importar" && (
        <div className="space-y-6">
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-sm">
            {[1, 2, 3, 4, 5].map((step) => (
              <div key={step} className="flex items-center gap-2">
                {step > 1 && (
                  <div className={`h-px w-8 ${currentStep >= step ? "bg-black" : "bg-gray-200"}`} />
                )}
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                    currentStep === step
                      ? "bg-black text-white"
                      : currentStep > step
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {currentStep > step ? <CheckCircle className="h-4 w-4" /> : step}
                </div>
              </div>
            ))}
          </div>

          {/* Step 1: Select type */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Selecciona el tipo de datos a importar
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {IMPORT_TYPES.map((type) => {
                  const Icon = type.icon;
                  const selected = selectedType === type.key;
                  return (
                    <button
                      key={type.key}
                      onClick={() => setSelectedType(type.key)}
                      className={`flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all ${
                        selected
                          ? "border-black bg-black/5"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                          selected ? "bg-black text-white" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{type.label}</p>
                        <p className="text-xs text-gray-500">{type.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex justify-end">
                <Button disabled={!selectedType} onClick={() => setCurrentStep(2)}>
                  Siguiente
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Upload CSV */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Cargar archivo CSV</h2>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mb-4">
                <p className="text-sm font-medium text-gray-700">
                  Columnas esperadas para {TYPE_LABELS[selectedType!] || selectedType}:
                </p>
                <code className="mt-1 block text-xs text-gray-500">
                  {COLUMN_HINTS[selectedType!]}
                </code>
              </div>

              {/* File input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Seleccionar archivo CSV
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
                />
              </div>

              {/* Or paste */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  O pegar contenido CSV directamente
                </label>
                <textarea
                  rows={8}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  placeholder={`${COLUMN_HINTS[selectedType!]}\nvalor1,valor2,...`}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>

              <div className="mt-6 flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  <ArrowLeft className="h-4 w-4" />
                  Atras
                </Button>
                <Button disabled={!csvContent.trim() || validating} onClick={handleValidate}>
                  {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Validar
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Validation results */}
          {currentStep === 3 && validationResult && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Resultados de Validacion</h2>

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-sm text-gray-500">Total filas</p>
                  <p className="text-2xl font-bold text-gray-900">{validationResult.totalRows}</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <p className="text-sm text-green-600">Validas</p>
                  <p className="text-2xl font-bold text-green-700">{validationResult.validRows}</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-600">Errores</p>
                  <p className="text-2xl font-bold text-red-700">
                    {validationResult.errors.length}
                  </p>
                </div>
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                  <p className="text-sm text-yellow-600">Advertencias</p>
                  <p className="text-2xl font-bold text-yellow-700">
                    {validationResult.warnings.length}
                  </p>
                </div>
              </div>

              {/* Preview table */}
              {validationResult.preview.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Vista previa (primeras 5 filas)
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(validationResult.preview[0]).map((col) => (
                            <th
                              key={col}
                              className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {validationResult.preview.map((row, idx) => (
                          <tr key={idx}>
                            {Object.values(row).map((val, colIdx) => (
                              <td
                                key={colIdx}
                                className="px-3 py-2 text-gray-700 whitespace-nowrap"
                              >
                                {val || "-"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Errors list */}
              {validationResult.errors.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    Errores ({validationResult.errors.length})
                  </h3>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-red-200 bg-red-50">
                    {validationResult.errors.slice(0, 50).map((err, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 px-3 py-2 text-xs border-b border-red-100 last:border-b-0"
                      >
                        <span className="font-mono text-red-600 flex-shrink-0">Fila {err.row}</span>
                        <span className="text-red-700 font-medium flex-shrink-0">
                          [{err.field}]
                        </span>
                        <span className="text-red-600">{err.message}</span>
                      </div>
                    ))}
                    {validationResult.errors.length > 50 && (
                      <div className="px-3 py-2 text-xs text-red-500 italic">
                        ...y {validationResult.errors.length - 50} errores mas
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {validationResult.warnings.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-yellow-700 mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    Advertencias ({validationResult.warnings.length})
                  </h3>
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-yellow-200 bg-yellow-50">
                    {validationResult.warnings.map((warn, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 px-3 py-2 text-xs border-b border-yellow-100 last:border-b-0"
                      >
                        <span className="text-yellow-700 font-medium">[{warn.field}]</span>
                        <span className="text-yellow-600">{warn.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(2)}>
                  <ArrowLeft className="h-4 w-4" />
                  Atras
                </Button>
                <Button
                  disabled={validationResult.validRows === 0}
                  onClick={() => setCurrentStep(needsBranch ? 4 : 4)}
                >
                  Continuar
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Branch selection (if needed) + confirm import */}
          {currentStep === 4 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Confirmar Importacion</h2>

              {needsBranch && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Seleccionar sucursal
                  </label>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                  >
                    <option value="">-- Seleccionar sucursal --</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Resumen</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-gray-500">Tipo:</span>
                  <span className="font-medium">{TYPE_LABELS[selectedType!] || selectedType}</span>
                  <span className="text-gray-500">Total filas:</span>
                  <span className="font-medium">{validationResult?.totalRows || 0}</span>
                  <span className="text-gray-500">Filas validas:</span>
                  <span className="font-medium text-green-700">
                    {validationResult?.validRows || 0}
                  </span>
                  {needsBranch && (
                    <>
                      <span className="text-gray-500">Sucursal:</span>
                      <span className="font-medium">
                        {branches.find((b) => b.id === selectedBranch)?.name || "No seleccionada"}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 mb-6">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">Atencion</p>
                    <p className="text-xs text-yellow-700 mt-1">
                      Los registros existentes seran actualizados (upsert por SKU, RFC, numero de
                      empleado, etc). Los nuevos registros seran creados. Esta accion no se puede
                      deshacer.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(3)}>
                  <ArrowLeft className="h-4 w-4" />
                  Atras
                </Button>
                <Button
                  disabled={importing || (needsBranch && !selectedBranch)}
                  onClick={handleImport}
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Importar
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Results */}
          {currentStep === 5 && importResult && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Resultado de la Importacion
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                  <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-green-700">{importResult.importedRows}</p>
                  <p className="text-sm text-green-600">Importados</p>
                </div>
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-center">
                  <AlertTriangle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-yellow-700">{importResult.skippedRows}</p>
                  <p className="text-sm text-yellow-600">Omitidos</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
                  <X className="h-8 w-8 text-red-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-red-700">{importResult.failedRows}</p>
                  <p className="text-sm text-red-600">Fallidos</p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-red-700 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      Errores ({importResult.errors.length})
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadErrors(importResult.errors)}
                    >
                      <Download className="h-3 w-3" />
                      Descargar errores
                    </Button>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-red-200 bg-red-50">
                    {importResult.errors.slice(0, 30).map((err, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 px-3 py-2 text-xs border-b border-red-100 last:border-b-0"
                      >
                        <span className="font-mono text-red-600 flex-shrink-0">Fila {err.row}</span>
                        <span className="text-red-700 font-medium flex-shrink-0">
                          [{err.field}]
                        </span>
                        <span className="text-red-600">{err.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={resetWizard}>Nueva importacion</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB: Plantillas */}
      {/* ================================================================== */}
      {activeTab === "plantillas" && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Plantillas CSV</h2>
          <p className="text-sm text-gray-500 mb-6">
            Descarga la plantilla con las columnas esperadas para cada tipo de importacion.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {IMPORT_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <div
                  key={type.key}
                  className="rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{type.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{type.description}</p>
                      <code className="mt-2 block text-[10px] text-gray-400 leading-relaxed">
                        {COLUMN_HINTS[type.key]}
                      </code>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadTemplate(type.key)}
                    >
                      <FileText className="h-3 w-3" />
                      Descargar CSV
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB: Historial */}
      {/* ================================================================== */}
      {activeTab === "historial" && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Historial de Importaciones</h2>

          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No hay importaciones registradas
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Archivo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Filas
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usuario
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {history.map((record) => {
                    const statusInfo = STATUS_MAP[record.status] || STATUS_MAP.PENDING;
                    return (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          {new Date(record.createdAt).toLocaleDateString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                          {TYPE_LABELS[record.importType] || record.importType}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs font-mono">
                          {record.fileName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusBadge label={statusInfo.label} variant={statusInfo.variant} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">
                          <span className="text-gray-500">{record.totalRows} total</span>
                          {" / "}
                          <span className="text-green-600">{record.importedRows} ok</span>
                          {record.failedRows > 0 && (
                            <>
                              {" / "}
                              <span className="text-red-600">{record.failedRows} err</span>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                          {record.createdBy.firstName} {record.createdBy.lastName}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
