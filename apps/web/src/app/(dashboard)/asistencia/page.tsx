"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { useApiQuery } from "@/hooks/use-api-query";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  UserCheck,
  Clock,
  LogIn,
  LogOut,
  AlertTriangle,
  Calendar,
  BarChart3,
  Filter,
  Users,
  CalendarOff,
  Edit3,
} from "lucide-react";

const TABS = ["Checador", "Historial", "Reportes"];

const STATUS_MAP: Record<string, { label: string; variant: string }> = {
  PRESENT: { label: "Presente", variant: "green" },
  LATE: { label: "Retardo", variant: "yellow" },
  ABSENT: { label: "Ausente", variant: "red" },
  HALF_DAY: { label: "Medio Dia", variant: "blue" },
  REST_DAY: { label: "Descanso", variant: "gray" },
  HOLIDAY: { label: "Festivo", variant: "purple" },
};

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function fmtTime(d: string | null | undefined): string {
  if (!d) return "---";
  return new Date(d).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "---";
  return new Date(d).toLocaleDateString("es-MX");
}

function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function getInitials(first: string, last: string): string {
  return `${(first || "")[0] || ""}${(last || "")[0] || ""}`.toUpperCase();
}

export default function AsistenciaPage() {
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("Checador");

  // ── Common state ──
  const { data: branches = [] } = useApiQuery<any[]>("/branches", ["branches"]);
  const [selectedBranch, setSelectedBranch] = useState("");

  // ── Checador state ──
  const [todayData, setTodayData] = useState<any>(null);
  const [loadingToday, setLoadingToday] = useState(false);
  const [clockLoading, setClockLoading] = useState<string | null>(null);

  // ── Historial state ──
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [histStartDate, setHistStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [histEndDate, setHistEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [histStatusFilter, setHistStatusFilter] = useState("ALL");

  // ── Reportes state ──
  const now = new Date();
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [reportData, setReportData] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // ── Edit modal state ──
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    clockIn: "",
    clockOut: "",
    status: "",
    notes: "",
  });

  // ── Holiday modal state ──
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayDate, setHolidayDate] = useState(() => new Date().toISOString().split("T")[0]);

  // ── Set default branch when branches load ──
  useEffect(() => {
    if (branches.length > 0 && !selectedBranch) {
      setSelectedBranch(branches[0].id);
    }
  }, [branches, selectedBranch]);

  // ── Checador: fetch today ──
  const fetchToday = useCallback(async () => {
    if (!selectedBranch) return;
    setLoadingToday(true);
    try {
      const data = await authFetch<any>(
        "get",
        `/nomina/attendance/today?branchId=${selectedBranch}`,
      );
      setTodayData(data);
    } catch {
      toast("Error al cargar asistencia de hoy", "error");
    } finally {
      setLoadingToday(false);
    }
  }, [authFetch, selectedBranch, toast]);

  useEffect(() => {
    if (activeTab === "Checador" && selectedBranch) {
      fetchToday();
    }
  }, [activeTab, selectedBranch, fetchToday]);

  // ── Clock in / out ──
  async function handleClockIn(employeeId: string) {
    setClockLoading(employeeId);
    try {
      await authFetch("post", "/nomina/attendance/clock-in", {
        employeeId,
        branchId: selectedBranch,
      });
      toast("Entrada registrada");
      fetchToday();
    } catch (err: any) {
      toast(err?.message || "Error al registrar entrada", "error");
    } finally {
      setClockLoading(null);
    }
  }

  async function handleClockOut(employeeId: string) {
    setClockLoading(employeeId);
    try {
      await authFetch("post", "/nomina/attendance/clock-out", { employeeId });
      toast("Salida registrada");
      fetchToday();
    } catch (err: any) {
      toast(err?.message || "Error al registrar salida", "error");
    } finally {
      setClockLoading(null);
    }
  }

  async function handleMarkAbsent(employeeId: string) {
    try {
      await authFetch("post", "/nomina/attendance/mark-absent", {
        employeeId,
        date: new Date().toISOString().split("T")[0],
      });
      toast("Marcado como ausente");
      fetchToday();
    } catch (err: any) {
      toast(err?.message || "Error al marcar ausencia", "error");
    }
  }

  async function handleMarkHoliday() {
    if (!selectedBranch || !holidayDate) return;
    try {
      await authFetch("post", "/nomina/attendance/mark-holiday", {
        branchId: selectedBranch,
        date: holidayDate,
      });
      toast("Dia festivo registrado");
      setShowHolidayModal(false);
      fetchToday();
    } catch (err: any) {
      toast(err?.message || "Error al registrar festivo", "error");
    }
  }

  // ── Historial: fetch ──
  const fetchHistory = useCallback(async () => {
    if (!selectedBranch) return;
    setLoadingHistory(true);
    try {
      const data = await authFetch<any[]>(
        "get",
        `/nomina/attendance/range?branchId=${selectedBranch}&startDate=${histStartDate}&endDate=${histEndDate}`,
      );
      setHistoryRecords(data);
    } catch {
      toast("Error al cargar historial", "error");
    } finally {
      setLoadingHistory(false);
    }
  }, [authFetch, selectedBranch, histStartDate, histEndDate, toast]);

  useEffect(() => {
    if (activeTab === "Historial" && selectedBranch) {
      fetchHistory();
    }
  }, [activeTab, selectedBranch, fetchHistory]);

  const filteredHistory =
    histStatusFilter === "ALL"
      ? historyRecords
      : historyRecords.filter((r: any) => r.status === histStatusFilter);

  // ── Edit record ──
  function openEditModal(record: any) {
    setEditingRecord(record);
    setEditForm({
      clockIn: record.clockIn ? new Date(record.clockIn).toISOString().slice(0, 16) : "",
      clockOut: record.clockOut ? new Date(record.clockOut).toISOString().slice(0, 16) : "",
      status: record.status || "PRESENT",
      notes: record.notes || "",
    });
    setShowEditModal(true);
  }

  async function handleEditSave() {
    if (!editingRecord) return;
    try {
      const body: any = { status: editForm.status, notes: editForm.notes };
      if (editForm.clockIn) body.clockIn = new Date(editForm.clockIn).toISOString();
      if (editForm.clockOut) body.clockOut = new Date(editForm.clockOut).toISOString();
      await authFetch("put", `/nomina/attendance/${editingRecord.id}`, body);
      toast("Registro actualizado");
      setShowEditModal(false);
      if (activeTab === "Checador") fetchToday();
      else fetchHistory();
    } catch (err: any) {
      toast(err?.message || "Error al actualizar registro", "error");
    }
  }

  // ── Reportes: fetch ──
  const fetchReport = useCallback(async () => {
    if (!selectedBranch) return;
    setLoadingReport(true);
    try {
      const data = await authFetch<any>(
        "get",
        `/nomina/attendance/summary?branchId=${selectedBranch}&month=${reportMonth}&year=${reportYear}`,
      );
      setReportData(data);
    } catch {
      toast("Error al cargar reporte", "error");
    } finally {
      setLoadingReport(false);
    }
  }, [authFetch, selectedBranch, reportMonth, reportYear, toast]);

  useEffect(() => {
    if (activeTab === "Reportes" && selectedBranch) {
      fetchReport();
    }
  }, [activeTab, selectedBranch, fetchReport]);

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserCheck className="h-7 w-7" />
            Asistencia
          </h1>
          <p className="text-sm text-gray-500 mt-1">Checador de asistencia y control de horas</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="w-52"
          >
            <option value="">Seleccionar sucursal</option>
            {branches.map((b: any) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {!selectedBranch ? (
        <div className="border rounded-lg p-12 text-center text-gray-400">
          Selecciona una sucursal para ver la asistencia
        </div>
      ) : (
        <>
          {/* ====== TAB: CHECADOR ====== */}
          {activeTab === "Checador" && (
            <div className="space-y-6">
              {/* Summary cards */}
              {todayData?.summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <SummaryCard
                    label="Presentes"
                    value={todayData.summary.present}
                    icon={<UserCheck className="h-5 w-5 text-green-600" />}
                    color="bg-green-50 border-green-200"
                  />
                  <SummaryCard
                    label="Retardos"
                    value={todayData.summary.late}
                    icon={<Clock className="h-5 w-5 text-yellow-600" />}
                    color="bg-yellow-50 border-yellow-200"
                  />
                  <SummaryCard
                    label="Ausentes"
                    value={todayData.summary.absent}
                    icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
                    color="bg-red-50 border-red-200"
                  />
                  <SummaryCard
                    label="Sin Registrar"
                    value={todayData.summary.notYet}
                    icon={<Users className="h-5 w-5 text-gray-600" />}
                    color="bg-gray-50 border-gray-200"
                  />
                  <SummaryCard
                    label="Total"
                    value={todayData.summary.total}
                    icon={<Users className="h-5 w-5 text-blue-600" />}
                    color="bg-blue-50 border-blue-200"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowHolidayModal(true)}>
                  <CalendarOff className="h-4 w-4" />
                  Marcar Dia Festivo
                </Button>
              </div>

              {/* Employee table */}
              <DataTable
                columns={[
                  {
                    key: "employee",
                    header: "Empleado",
                    render: (row: any) => (
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white text-xs font-bold flex-shrink-0">
                          {getInitials(row.employee.firstName, row.employee.lastName)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {row.employee.firstName} {row.employee.lastName}
                          </p>
                          <p className="text-xs text-gray-500">{row.employee.jobPosition}</p>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "schedule",
                    header: "Horario",
                    render: (row: any) =>
                      row.shift ? `${row.shift.startTime} - ${row.shift.endTime}` : "Sin turno",
                  },
                  {
                    key: "clockIn",
                    header: "Entrada",
                    render: (row: any) => {
                      if (!row.record?.clockIn) return <span className="text-gray-400">---</span>;
                      const isLate = row.record.status === "LATE";
                      return (
                        <span
                          className={
                            isLate ? "text-red-600 font-medium" : "text-green-600 font-medium"
                          }
                        >
                          {fmtTime(row.record.clockIn)}
                        </span>
                      );
                    },
                  },
                  {
                    key: "clockOut",
                    header: "Salida",
                    render: (row: any) => {
                      if (!row.record?.clockOut) return <span className="text-gray-400">---</span>;
                      return <span className="font-medium">{fmtTime(row.record.clockOut)}</span>;
                    },
                  },
                  {
                    key: "status",
                    header: "Estado",
                    render: (row: any) => {
                      if (!row.record) {
                        return <StatusBadge label="Sin registro" variant="gray" />;
                      }
                      const s = STATUS_MAP[row.record.status] || {
                        label: row.record.status,
                        variant: "gray",
                      };
                      return <StatusBadge label={s.label} variant={s.variant as any} />;
                    },
                  },
                  {
                    key: "actions",
                    header: "Acciones",
                    render: (row: any) => {
                      const isLoading = clockLoading === row.employee.id;
                      const hasClockIn = row.record?.clockIn;
                      const hasClockOut = row.record?.clockOut;
                      const isAbsent = row.record?.status === "ABSENT";
                      const isHoliday = row.record?.status === "HOLIDAY";

                      if (isHoliday) {
                        return <span className="text-xs text-gray-400">Dia festivo</span>;
                      }

                      return (
                        <div className="flex items-center gap-2">
                          {!hasClockIn && !isAbsent && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleClockIn(row.employee.id)}
                                disabled={isLoading}
                              >
                                <LogIn className="h-3.5 w-3.5" />
                                Entrada
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleMarkAbsent(row.employee.id)}
                              >
                                Falta
                              </Button>
                            </>
                          )}
                          {hasClockIn && !hasClockOut && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleClockOut(row.employee.id)}
                              disabled={isLoading}
                            >
                              <LogOut className="h-3.5 w-3.5" />
                              Salida
                            </Button>
                          )}
                          {row.record && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditModal(row.record)}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      );
                    },
                  },
                ]}
                data={todayData?.employees || []}
                loading={loadingToday}
                emptyMessage="No hay empleados en esta sucursal"
              />
            </div>
          )}

          {/* ====== TAB: HISTORIAL ====== */}
          {activeTab === "Historial" && (
            <div className="space-y-6">
              {/* Filters */}
              <div className="flex flex-wrap items-end gap-4">
                <FormField label="Fecha Inicio">
                  <Input
                    type="date"
                    value={histStartDate}
                    onChange={(e) => setHistStartDate(e.target.value)}
                  />
                </FormField>
                <FormField label="Fecha Fin">
                  <Input
                    type="date"
                    value={histEndDate}
                    onChange={(e) => setHistEndDate(e.target.value)}
                  />
                </FormField>
                <FormField label="Estado">
                  <Select
                    value={histStatusFilter}
                    onChange={(e) => setHistStatusFilter(e.target.value)}
                  >
                    <option value="ALL">Todos</option>
                    {Object.entries(STATUS_MAP).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <Button onClick={fetchHistory} variant="outline" size="md">
                  <Filter className="h-4 w-4" />
                  Filtrar
                </Button>
              </div>

              <DataTable
                columns={[
                  {
                    key: "employee",
                    header: "Empleado",
                    render: (row: any) => (
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white text-xs font-bold flex-shrink-0">
                          {getInitials(row.employee.firstName, row.employee.lastName)}
                        </div>
                        <span className="font-medium">
                          {row.employee.firstName} {row.employee.lastName}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: "date",
                    header: "Fecha",
                    render: (row: any) => fmtDate(row.date),
                  },
                  {
                    key: "clockIn",
                    header: "Entrada",
                    render: (row: any) => {
                      if (!row.clockIn) return <span className="text-gray-400">---</span>;
                      const isLate = row.status === "LATE";
                      return (
                        <span
                          className={
                            isLate ? "text-red-600 font-medium" : "text-green-600 font-medium"
                          }
                        >
                          {fmtTime(row.clockIn)}
                        </span>
                      );
                    },
                  },
                  {
                    key: "clockOut",
                    header: "Salida",
                    render: (row: any) =>
                      row.clockOut ? (
                        fmtTime(row.clockOut)
                      ) : (
                        <span className="text-gray-400">---</span>
                      ),
                  },
                  {
                    key: "workedHours",
                    header: "Horas",
                    render: (row: any) =>
                      row.workedHours != null ? `${safeNum(row.workedHours).toFixed(1)}h` : "---",
                  },
                  {
                    key: "lateMinutes",
                    header: "Min. Retardo",
                    render: (row: any) =>
                      row.lateMinutes > 0 ? (
                        <span className="text-red-600">{row.lateMinutes} min</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      ),
                  },
                  {
                    key: "status",
                    header: "Estado",
                    render: (row: any) => {
                      const s = STATUS_MAP[row.status] || { label: row.status, variant: "gray" };
                      return <StatusBadge label={s.label} variant={s.variant as any} />;
                    },
                  },
                  {
                    key: "actions",
                    header: "",
                    render: (row: any) => (
                      <Button variant="ghost" size="sm" onClick={() => openEditModal(row)}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                    ),
                  },
                ]}
                data={filteredHistory}
                loading={loadingHistory}
                emptyMessage="No hay registros para el periodo seleccionado"
              />
            </div>
          )}

          {/* ====== TAB: REPORTES ====== */}
          {activeTab === "Reportes" && (
            <div className="space-y-6">
              {/* Filters */}
              <div className="flex flex-wrap items-end gap-4">
                <FormField label="Mes">
                  <Select
                    value={reportMonth}
                    onChange={(e) => setReportMonth(Number(e.target.value))}
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={i} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Ano">
                  <Select
                    value={reportYear}
                    onChange={(e) => setReportYear(Number(e.target.value))}
                  >
                    {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <Button onClick={fetchReport} variant="outline" size="md">
                  <BarChart3 className="h-4 w-4" />
                  Generar Reporte
                </Button>
              </div>

              {/* Branch summary cards */}
              {reportData?.branchSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SummaryCard
                    label="Puntualidad Promedio"
                    value={`${reportData.branchSummary.avgPunctuality}%`}
                    icon={<UserCheck className="h-5 w-5 text-green-600" />}
                    color="bg-green-50 border-green-200"
                  />
                  <SummaryCard
                    label="Horas Totales"
                    value={`${reportData.branchSummary.totalHours}h`}
                    icon={<Clock className="h-5 w-5 text-blue-600" />}
                    color="bg-blue-50 border-blue-200"
                  />
                  <SummaryCard
                    label="Tasa Ausentismo"
                    value={`${reportData.branchSummary.absenteeismRate}%`}
                    icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
                    color="bg-red-50 border-red-200"
                  />
                  <SummaryCard
                    label="Retardos Totales"
                    value={reportData.branchSummary.totalLate}
                    icon={<Clock className="h-5 w-5 text-yellow-600" />}
                    color="bg-yellow-50 border-yellow-200"
                  />
                </div>
              )}

              {/* Per-employee report table */}
              <DataTable
                columns={[
                  {
                    key: "employee",
                    header: "Empleado",
                    render: (row: any) => (
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white text-xs font-bold flex-shrink-0">
                          {getInitials(row.employee.firstName, row.employee.lastName)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {row.employee.firstName} {row.employee.lastName}
                          </p>
                          <p className="text-xs text-gray-500">{row.employee.jobPosition}</p>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "present",
                    header: "Dias Trabajados",
                    render: (row: any) => (
                      <span className="text-green-700 font-medium">{row.present}</span>
                    ),
                  },
                  {
                    key: "late",
                    header: "Dias Retardo",
                    render: (row: any) =>
                      row.late > 0 ? (
                        <span className="text-yellow-700 font-medium">{row.late}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      ),
                  },
                  {
                    key: "absent",
                    header: "Ausencias",
                    render: (row: any) =>
                      row.absent > 0 ? (
                        <span className="text-red-700 font-medium">{row.absent}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      ),
                  },
                  {
                    key: "totalHours",
                    header: "Horas Totales",
                    render: (row: any) => `${row.totalHours}h`,
                  },
                  {
                    key: "totalOvertimeMin",
                    header: "Horas Extra",
                    render: (row: any) =>
                      row.totalOvertimeMin > 0
                        ? `${(safeNum(row.totalOvertimeMin) / 60).toFixed(1)}h`
                        : "0h",
                  },
                  {
                    key: "avgHours",
                    header: "Promedio Hrs/Dia",
                    render: (row: any) => `${row.avgHours}h`,
                  },
                  {
                    key: "punctuality",
                    header: "Puntualidad",
                    render: (row: any) => {
                      const pct = (
                        safeNum(row.present) + safeNum(row.late) > 0
                          ? ((safeNum(row.present) - safeNum(row.late)) /
                              (safeNum(row.present) + safeNum(row.late))) *
                            100
                          : 0
                      ).toFixed(0);
                      const val = safeNum(pct);
                      return (
                        <span
                          className={
                            val >= 80
                              ? "text-green-700 font-medium"
                              : val >= 50
                                ? "text-yellow-700 font-medium"
                                : "text-red-700 font-medium"
                          }
                        >
                          {pct}%
                        </span>
                      );
                    },
                  },
                ]}
                data={reportData?.employees || []}
                loading={loadingReport}
                emptyMessage="No hay datos para el periodo seleccionado"
              />
            </div>
          )}
        </>
      )}

      {/* ====== EDIT MODAL ====== */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Registro de Asistencia"
      >
        <div className="space-y-4">
          <FormField label="Hora de Entrada">
            <Input
              type="datetime-local"
              value={editForm.clockIn}
              onChange={(e) => setEditForm({ ...editForm, clockIn: e.target.value })}
            />
          </FormField>
          <FormField label="Hora de Salida">
            <Input
              type="datetime-local"
              value={editForm.clockOut}
              onChange={(e) => setEditForm({ ...editForm, clockOut: e.target.value })}
            />
          </FormField>
          <FormField label="Estado">
            <Select
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
            >
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Notas">
            <Input
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              placeholder="Nota opcional..."
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEditSave}>Guardar</Button>
          </div>
        </div>
      </Modal>

      {/* ====== HOLIDAY MODAL ====== */}
      <Modal
        open={showHolidayModal}
        onClose={() => setShowHolidayModal(false)}
        title="Marcar Dia Festivo"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Se marcara como dia festivo para todos los empleados de esta sucursal.
          </p>
          <FormField label="Fecha">
            <Input
              type="date"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowHolidayModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleMarkHoliday}>Confirmar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Summary Card Component ──
function SummaryCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className={`rounded-lg border p-4 ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        {icon}
      </div>
    </div>
  );
}
