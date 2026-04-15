"use client";

import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { useApiQuery } from "@/hooks/use-api-query";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-field";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Calendar,
  Users,
  Palette,
  X,
} from "lucide-react";

// ── Types ──

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  jobPosition: string;
  employeeNumber: string;
  branchId: string;
}

interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  color: string;
  isActive: boolean;
}

interface ShiftAssignment {
  id: string;
  employeeId: string;
  branchId: string;
  shiftTemplateId: string;
  date: string;
  status: string;
  notes: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    jobPosition: string;
    employeeNumber: string;
  };
  shiftTemplate: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    breakMinutes?: number;
    color: string;
  };
}

interface WeekSummary {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  totalHours: number;
  totalBreakMinutes: number;
  shifts: number;
}

// ── Helpers ──

function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

const TABS = ["Calendario Semanal", "Asignar Turnos", "Turnos"];

const DAY_NAMES = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function getWeekDates(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const mOpts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
  };
  const sOpts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  };
  return `${monday.toLocaleDateString("es-MX", mOpts)} - ${sunday.toLocaleDateString("es-MX", sOpts)}`;
}

const PRESET_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F97316",
];

export default function HorariosPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("Calendario Semanal");

  // ── Shared state (React Query) ──
  const { data: branches = [] } = useApiQuery<Branch[]>("/branches", ["branches"]);
  const { data: employees = [] } = useApiQuery<Employee[]>(
    "/nomina/employees",
    ["horarios-employees"],
  );
  const { data: templates = [], isLoading: loadingTemplates } = useApiQuery<ShiftTemplate[]>(
    "/nomina/shifts/templates",
    ["shift-templates"],
  );
  const [selectedBranch, setSelectedBranch] = useState("");

  // Set default branch when branches load
  useEffect(() => {
    if (branches.length > 0 && !selectedBranch) {
      setSelectedBranch(branches[0].id);
    }
  }, [branches, selectedBranch]);

  // ── Calendar state ──
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [schedule, setSchedule] = useState<ShiftAssignment[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [summary, setSummary] = useState<WeekSummary[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignDate, setAssignDate] = useState("");
  const [assignEmployee, setAssignEmployee] = useState("");
  const [assignTemplate, setAssignTemplate] = useState("");

  // ── Bulk assign state ──
  const [bulkBranch, setBulkBranch] = useState("");
  const [bulkEmployee, setBulkEmployee] = useState("");
  const [bulkTemplate, setBulkTemplate] = useState("");
  const [bulkDateFrom, setBulkDateFrom] = useState("");
  const [bulkDateTo, setBulkDateTo] = useState("");
  const [bulkAssigning, setBulkAssigning] = useState(false);

  // ── Template CRUD state ──
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(
    null,
  );
  const [templateForm, setTemplateForm] = useState({
    name: "",
    startTime: "08:00",
    endTime: "16:00",
    breakMinutes: "30",
    color: "#3B82F6",
  });

  // ── Data loading ──

  const fetchSchedule = useCallback(async () => {
    if (!authFetch || !selectedBranch) return;
    setLoadingSchedule(true);
    try {
      const data = await authFetch<ShiftAssignment[]>(
        "get",
        `/nomina/shifts/schedule?branchId=${selectedBranch}&weekStart=${formatDate(weekStart)}`,
      );
      setSchedule(data);
    } catch {
      // silent
    } finally {
      setLoadingSchedule(false);
    }
  }, [authFetch, selectedBranch, weekStart]);

  const fetchSummary = useCallback(async () => {
    if (!authFetch || !selectedBranch) return;
    try {
      const data = await authFetch<WeekSummary[]>(
        "get",
        `/nomina/shifts/summary?branchId=${selectedBranch}&weekStart=${formatDate(weekStart)}`,
      );
      setSummary(data);
    } catch {
      // silent
    }
  }, [authFetch, selectedBranch, weekStart]);

  useEffect(() => {
    if (!authLoading && selectedBranch) {
      fetchSchedule();
      fetchSummary();
    }
  }, [authLoading, selectedBranch, weekStart, fetchSchedule, fetchSummary]);

  // ── Calendar actions ──

  const handleCellClick = (employeeId: string, date: Date) => {
    setAssignEmployee(employeeId);
    setAssignDate(formatDate(date));
    setAssignTemplate(templates.length > 0 ? templates[0].id : "");
    setShowAssignModal(true);
  };

  const handleAssignSubmit = async () => {
    if (!authFetch || !assignEmployee || !assignTemplate || !assignDate) return;
    try {
      await authFetch("post", "/nomina/shifts/assign", {
        employeeId: assignEmployee,
        branchId: selectedBranch,
        shiftTemplateId: assignTemplate,
        date: assignDate,
      });
      toast("Turno asignado correctamente");
      setShowAssignModal(false);
      fetchSchedule();
      fetchSummary();
    } catch {
      toast("Error al asignar turno", "error");
    }
  };

  const handleRemoveAssignment = async (id: string) => {
    if (!authFetch) return;
    try {
      await authFetch("delete", `/nomina/shifts/assign/${id}`);
      toast("Turno eliminado");
      fetchSchedule();
      fetchSummary();
    } catch {
      toast("Error al eliminar turno", "error");
    }
  };

  // ── Bulk assign ──

  const handleBulkAssign = async () => {
    if (
      !authFetch ||
      !bulkEmployee ||
      !bulkBranch ||
      !bulkTemplate ||
      !bulkDateFrom ||
      !bulkDateTo
    )
      return;
    setBulkAssigning(true);
    try {
      const dates: string[] = [];
      const start = new Date(bulkDateFrom);
      const end = new Date(bulkDateTo);
      const current = new Date(start);
      while (current <= end) {
        dates.push(formatDate(current));
        current.setDate(current.getDate() + 1);
      }
      if (dates.length === 0) {
        toast("Rango de fechas invalido", "error");
        setBulkAssigning(false);
        return;
      }
      await authFetch("post", "/nomina/shifts/assign/bulk", {
        employeeId: bulkEmployee,
        branchId: bulkBranch,
        shiftTemplateId: bulkTemplate,
        dates,
      });
      toast(`${dates.length} turnos asignados correctamente`);
      fetchSchedule();
      fetchSummary();
    } catch {
      toast("Error al asignar turnos", "error");
    } finally {
      setBulkAssigning(false);
    }
  };

  // ── Template CRUD ──

  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: "",
      startTime: "08:00",
      endTime: "16:00",
      breakMinutes: "30",
      color: "#3B82F6",
    });
    setShowTemplateModal(true);
  };

  const openEditTemplate = (t: ShiftTemplate) => {
    setEditingTemplate(t);
    setTemplateForm({
      name: t.name,
      startTime: t.startTime,
      endTime: t.endTime,
      breakMinutes: String(t.breakMinutes),
      color: t.color,
    });
    setShowTemplateModal(true);
  };

  const handleTemplateSave = async () => {
    if (!authFetch) return;
    const payload = {
      name: templateForm.name,
      startTime: templateForm.startTime,
      endTime: templateForm.endTime,
      breakMinutes: parseInt(templateForm.breakMinutes, 10) || 30,
      color: templateForm.color,
    };
    try {
      if (editingTemplate) {
        await authFetch(
          "put",
          `/nomina/shifts/templates/${editingTemplate.id}`,
          payload,
        );
        toast("Turno actualizado");
      } else {
        await authFetch("post", "/nomina/shifts/templates", payload);
        toast("Turno creado");
      }
      setShowTemplateModal(false);
      queryClient.invalidateQueries({ queryKey: ["shift-templates"] });
    } catch {
      toast("Error al guardar turno", "error");
    }
  };

  const handleTemplateDelete = async (id: string) => {
    if (!authFetch) return;
    try {
      await authFetch("delete", `/nomina/shifts/templates/${id}`);
      toast("Turno eliminado");
      queryClient.invalidateQueries({ queryKey: ["shift-templates"] });
    } catch {
      toast("Error al eliminar turno", "error");
    }
  };

  // ── Build calendar data ──

  const weekDates = getWeekDates(weekStart);

  const branchEmployees = employees.filter(
    (e) => e.branchId === selectedBranch,
  );

  const scheduleMap = new Map<string, ShiftAssignment>();
  for (const a of schedule) {
    const dateKey = new Date(a.date).toISOString().split("T")[0];
    scheduleMap.set(`${a.employeeId}_${dateKey}`, a);
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="h-7 w-7" />
          <div>
            <h1 className="text-2xl font-bold">Horarios y Turnos</h1>
            <p className="text-sm text-gray-500">
              Gestiona los horarios de trabajo de tus empleados
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════
          TAB: Calendario Semanal
         ════════════════════════════════════════════════════════════ */}
      {activeTab === "Calendario Semanal" && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">
                Sucursal:
              </label>
              <Select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-48"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekStart(addDays(weekStart, -7))}
                className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium min-w-[200px] text-center">
                {formatWeekRange(weekStart)}
              </span>
              <button
                onClick={() => setWeekStart(addDays(weekStart, 7))}
                className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setWeekStart(getMonday(new Date()))}
                className="ml-2 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Hoy
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          {loadingSchedule ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-black" />
            </div>
          ) : branchEmployees.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No hay empleados en esta sucursal</p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 border-b border-r border-gray-200 w-48 sticky left-0 bg-gray-50 z-10">
                      Empleado
                    </th>
                    {weekDates.map((date, i) => {
                      const isToday =
                        formatDate(date) === formatDate(new Date());
                      return (
                        <th
                          key={i}
                          className={`text-center px-2 py-2 text-xs font-semibold border-b border-r last:border-r-0 border-gray-200 ${isToday ? "bg-black text-white" : "text-gray-600"}`}
                        >
                          <div>{DAY_NAMES[i]}</div>
                          <div className="font-normal">
                            {formatDateShort(date)}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {branchEmployees.map((emp) => (
                    <tr
                      key={emp.id}
                      className="border-b last:border-b-0 border-gray-100 hover:bg-gray-50/50"
                    >
                      <td className="px-3 py-2 border-r border-gray-200 sticky left-0 bg-white z-10">
                        <div className="text-sm font-medium text-gray-900">
                          {emp.firstName} {emp.lastName}
                        </div>
                        <div className="text-xs text-gray-400">
                          {emp.jobPosition}
                        </div>
                      </td>
                      {weekDates.map((date, i) => {
                        const key = `${emp.id}_${formatDate(date)}`;
                        const assignment = scheduleMap.get(key);
                        return (
                          <td
                            key={i}
                            className="px-1 py-1 border-r last:border-r-0 border-gray-100 text-center align-middle"
                          >
                            {assignment ? (
                              <button
                                onClick={() =>
                                  handleRemoveAssignment(assignment.id)
                                }
                                className="group relative w-full rounded-md px-1.5 py-1.5 text-xs font-medium text-white transition-all hover:opacity-80"
                                style={{
                                  backgroundColor:
                                    assignment.shiftTemplate.color,
                                }}
                                title={`${assignment.shiftTemplate.name} (${assignment.shiftTemplate.startTime}-${assignment.shiftTemplate.endTime}) — Click para eliminar`}
                              >
                                <div className="truncate">
                                  {assignment.shiftTemplate.name}
                                </div>
                                <div className="text-[10px] opacity-80">
                                  {assignment.shiftTemplate.startTime}-
                                  {assignment.shiftTemplate.endTime}
                                </div>
                                <div className="absolute -top-1 -right-1 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white">
                                  <X className="h-3 w-3" />
                                </div>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleCellClick(emp.id, date)}
                                className="w-full h-12 rounded-md border border-dashed border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-colors flex items-center justify-center"
                                title="Asignar turno"
                              >
                                <Plus className="h-3 w-3 text-gray-300" />
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Week Summary */}
          {summary.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3 text-gray-700">
                Resumen de la Semana
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {summary.map((s) => (
                  <div
                    key={s.employeeId}
                    className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {s.employeeName}
                      </div>
                      <div className="text-xs text-gray-400">
                        #{s.employeeNumber}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-black">
                        {safeNum(s.totalHours).toFixed(1)}h
                      </div>
                      <div className="text-xs text-gray-400">
                        {s.shifts} turnos
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: Asignar Turnos
         ════════════════════════════════════════════════════════════ */}
      {activeTab === "Asignar Turnos" && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Asignacion Masiva de Turnos
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormField label="Sucursal" required>
                <Select
                  value={bulkBranch}
                  onChange={(e) => setBulkBranch(e.target.value)}
                >
                  <option value="">Seleccionar sucursal...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Empleado" required>
                <Select
                  value={bulkEmployee}
                  onChange={(e) => setBulkEmployee(e.target.value)}
                >
                  <option value="">Seleccionar empleado...</option>
                  {employees
                    .filter((e) => !bulkBranch || e.branchId === bulkBranch)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName} — {e.jobPosition}
                      </option>
                    ))}
                </Select>
              </FormField>
              <FormField label="Turno" required>
                <Select
                  value={bulkTemplate}
                  onChange={(e) => setBulkTemplate(e.target.value)}
                >
                  <option value="">Seleccionar turno...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.startTime}-{t.endTime})
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Fecha Inicio" required>
                <Input
                  type="date"
                  value={bulkDateFrom}
                  onChange={(e) => setBulkDateFrom(e.target.value)}
                />
              </FormField>
              <FormField label="Fecha Fin" required>
                <Input
                  type="date"
                  value={bulkDateTo}
                  onChange={(e) => setBulkDateTo(e.target.value)}
                />
              </FormField>
              <div className="flex items-end">
                <Button
                  onClick={handleBulkAssign}
                  disabled={
                    bulkAssigning ||
                    !bulkBranch ||
                    !bulkEmployee ||
                    !bulkTemplate ||
                    !bulkDateFrom ||
                    !bulkDateTo
                  }
                  className="w-full"
                >
                  {bulkAssigning ? "Asignando..." : "Asignar Turnos"}
                </Button>
              </div>
            </div>
          </div>

          {/* Current week assignments preview */}
          {selectedBranch && schedule.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-base font-semibold mb-4">
                Asignaciones de esta Semana
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-medium text-gray-600">
                        Empleado
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">
                        Fecha
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">
                        Turno
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">
                        Horario
                      </th>
                      <th className="text-center py-2 px-3 font-medium text-gray-600">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((a) => (
                      <tr
                        key={a.id}
                        className="border-b last:border-b-0 border-gray-50 hover:bg-gray-50"
                      >
                        <td className="py-2 px-3">
                          {a.employee.firstName} {a.employee.lastName}
                        </td>
                        <td className="py-2 px-3 text-gray-600">
                          {new Date(a.date).toLocaleDateString("es-MX", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                            style={{
                              backgroundColor: a.shiftTemplate.color,
                            }}
                          >
                            {a.shiftTemplate.name}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-600">
                          {a.shiftTemplate.startTime} -{" "}
                          {a.shiftTemplate.endTime}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => handleRemoveAssignment(a.id)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: Turnos (Templates CRUD)
         ════════════════════════════════════════════════════════════ */}
      {activeTab === "Turnos" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Plantillas de Turno</h3>
            <Button onClick={openNewTemplate} size="sm">
              <Plus className="h-4 w-4" />
              Nuevo Turno
            </Button>
          </div>

          {loadingTemplates ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-black" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-gray-400 border border-gray-200 rounded-lg">
              <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No hay turnos configurados</p>
              <Button
                onClick={openNewTemplate}
                variant="outline"
                size="sm"
                className="mt-3"
              >
                <Plus className="h-4 w-4" />
                Crear primer turno
              </Button>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">
                      Color
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">
                      Nombre
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">
                      Hora Inicio
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">
                      Hora Fin
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">
                      Descanso
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">
                      Horas Netas
                    </th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-600">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => {
                    const [sH, sM] = t.startTime.split(":").map(Number);
                    const [eH, eM] = t.endTime.split(":").map(Number);
                    let hours = eH - sH + (eM - sM) / 60;
                    if (hours < 0) hours += 24;
                    const net = safeNum(hours) - safeNum(t.breakMinutes) / 60;
                    return (
                      <tr
                        key={t.id}
                        className="border-b last:border-b-0 border-gray-50 hover:bg-gray-50"
                      >
                        <td className="py-3 px-4">
                          <div
                            className="h-6 w-6 rounded-full border border-gray-200"
                            style={{ backgroundColor: t.color }}
                          />
                        </td>
                        <td className="py-3 px-4 font-medium">{t.name}</td>
                        <td className="py-3 px-4 text-gray-600">
                          {t.startTime}
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          {t.endTime}
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          {t.breakMinutes} min
                        </td>
                        <td className="py-3 px-4 font-medium">
                          {safeNum(net).toFixed(1)}h
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openEditTemplate(t)}
                              className="text-gray-400 hover:text-black transition-colors text-xs font-medium underline"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleTemplateDelete(t.id)}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
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

      {/* ════════════════════════════════════════════════════════════
          MODAL: Quick Assign (from calendar cell click)
         ════════════════════════════════════════════════════════════ */}
      <Modal
        open={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Asignar Turno"
      >
        <div className="space-y-4">
          <FormField label="Empleado">
            <Select
              value={assignEmployee}
              onChange={(e) => setAssignEmployee(e.target.value)}
            >
              {branchEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Fecha">
            <Input
              type="date"
              value={assignDate}
              onChange={(e) => setAssignDate(e.target.value)}
            />
          </FormField>
          <FormField label="Turno" required>
            <Select
              value={assignTemplate}
              onChange={(e) => setAssignTemplate(e.target.value)}
            >
              <option value="">Seleccionar turno...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.startTime}-{t.endTime})
                </option>
              ))}
            </Select>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowAssignModal(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAssignSubmit}
              disabled={!assignTemplate}
            >
              Asignar
            </Button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════════
          MODAL: Template Create/Edit
         ════════════════════════════════════════════════════════════ */}
      <Modal
        open={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        title={editingTemplate ? "Editar Turno" : "Nuevo Turno"}
      >
        <div className="space-y-4">
          <FormField label="Nombre" required>
            <Input
              value={templateForm.name}
              onChange={(e) =>
                setTemplateForm({ ...templateForm, name: e.target.value })
              }
              placeholder="ej. Matutino, Vespertino..."
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Hora Inicio" required>
              <Input
                type="time"
                value={templateForm.startTime}
                onChange={(e) =>
                  setTemplateForm({
                    ...templateForm,
                    startTime: e.target.value,
                  })
                }
              />
            </FormField>
            <FormField label="Hora Fin" required>
              <Input
                type="time"
                value={templateForm.endTime}
                onChange={(e) =>
                  setTemplateForm({
                    ...templateForm,
                    endTime: e.target.value,
                  })
                }
              />
            </FormField>
          </div>
          <FormField label="Minutos de Descanso">
            <Input
              type="number"
              min="0"
              max="120"
              value={templateForm.breakMinutes}
              onChange={(e) =>
                setTemplateForm({
                  ...templateForm,
                  breakMinutes: e.target.value,
                })
              }
            />
          </FormField>
          <FormField label="Color">
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() =>
                    setTemplateForm({ ...templateForm, color: c })
                  }
                  className={`h-8 w-8 rounded-full border-2 transition-all ${
                    templateForm.color === c
                      ? "border-black scale-110"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={templateForm.color}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, color: e.target.value })
                }
                className="h-8 w-8 cursor-pointer rounded-full border border-gray-200"
                title="Color personalizado"
              />
            </div>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowTemplateModal(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleTemplateSave}
              disabled={
                !templateForm.name ||
                !templateForm.startTime ||
                !templateForm.endTime
              }
            >
              {editingTemplate ? "Guardar Cambios" : "Crear Turno"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
