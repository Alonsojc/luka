"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Gift,
  Star,
  Crown,
  Award,
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
  Settings,
  ChevronLeft,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/form-field";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoyaltyCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  loyaltyPoints: number;
  loyaltyTier: string;
  totalPointsEarned: number;
  registeredAt: string;
  updatedAt: string;
  loyaltyTransactions: { createdAt: string }[];
}

interface CustomerDetail extends LoyaltyCustomer {
  currentTier: { name: string; minPoints: number; multiplier: number } | null;
  nextTier: { name: string; minPoints: number; multiplier: number } | null;
  pointsToNextTier: number;
  loyaltyTransactions: LoyaltyTransaction[];
}

interface LoyaltyTransaction {
  id: string;
  type: string;
  points: number;
  balance: number;
  description: string | null;
  referenceType: string | null;
  createdAt: string;
  branch?: { name: string; code: string } | null;
}

interface LoyaltyReward {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  category: string;
  isActive: boolean;
  imageUrl: string | null;
  maxRedemptions: number | null;
  currentRedemptions: number;
  validFrom: string | null;
  validUntil: string | null;
}

interface LoyaltyProgram {
  id: string;
  name: string;
  pointsPerDollar: number;
  pointValue: number;
  minRedemption: number;
  expirationDays: number | null;
  isActive: boolean;
  tiers: TierConfig[] | null;
}

interface TierConfig {
  name: string;
  minPoints: number;
  multiplier: number;
}

interface DashboardData {
  totalMembers: number;
  activeMembers: number;
  pointsInCirculation: number;
  pointsEarnedThisMonth: number;
  pointsRedeemedThisMonth: number;
  topRedeemers: {
    customerId: string;
    name: string;
    points: number;
    tier: string;
  }[];
  tierDistribution: { tier: string; count: number }[];
  redemptionsByReward: {
    rewardId: string;
    name: string;
    count: number;
  }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { key: "miembros", label: "Miembros", icon: Users },
  { key: "recompensas", label: "Recompensas", icon: Gift },
  { key: "dashboard", label: "Dashboard", icon: TrendingUp },
  { key: "configuracion", label: "Configuracion", icon: Settings },
];

const TIER_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Bronce: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300" },
  Plata: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" },
  Oro: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-400" },
};

const CATEGORY_LABELS: Record<string, string> = {
  PRODUCT: "Producto gratis",
  DISCOUNT: "Descuento",
  FREEBIE: "Complemento",
};

const PIE_COLORS = ["#d97706", "#6b7280", "#eab308", "#3b82f6", "#10b981"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function fmtNum(n: number) {
  return safeNum(n).toLocaleString("es-MX");
}

function TierBadge({ tier }: { tier: string }) {
  const style = TIER_STYLES[tier] || TIER_STYLES.Bronce;
  const Icon = tier === "Oro" ? Crown : tier === "Plata" ? Award : Star;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}
    >
      <Icon className="h-3 w-3" />
      {tier}
    </span>
  );
}

// ===========================================================================
// PAGE COMPONENT
// ===========================================================================

export default function LealtadPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState("miembros");

  // Shared state
  const [customers, setCustomers] = useState<LoyaltyCustomer[]>([]);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [program, setProgram] = useState<LoyaltyProgram | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Search / filter
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");

  // Modals
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerDetail | null>(null);
  const [showCustomerDetail, setShowCustomerDetail] = useState(false);
  const [showEarnModal, setShowEarnModal] = useState(false);
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [editingReward, setEditingReward] = useState<LoyaltyReward | null>(
    null,
  );

  // Form state
  const [earnForm, setEarnForm] = useState({ customerId: "", amount: "" });
  const [redeemForm, setRedeemForm] = useState({
    customerId: "",
    rewardId: "",
    points: "",
  });
  const [adjustForm, setAdjustForm] = useState({
    customerId: "",
    points: "",
    description: "",
  });
  const [rewardForm, setRewardForm] = useState({
    name: "",
    description: "",
    pointsCost: "",
    category: "PRODUCT",
    maxRedemptions: "",
    validFrom: "",
    validUntil: "",
  });
  const [configForm, setConfigForm] = useState({
    name: "",
    pointsPerDollar: "",
    pointValue: "",
    minRedemption: "",
    expirationDays: "",
    tiers: [] as TierConfig[],
  });

  const [saving, setSaving] = useState(false);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchCustomers = useCallback(async () => {
    try {
      const data = await authFetch<LoyaltyCustomer[]>("get", "/loyalty/customers");
      setCustomers(data);
    } catch {
      // silent
    }
  }, [authFetch]);

  const fetchRewards = useCallback(async () => {
    try {
      const data = await authFetch<LoyaltyReward[]>("get", "/loyalty/rewards");
      setRewards(data);
    } catch {
      // silent
    }
  }, [authFetch]);

  const fetchProgram = useCallback(async () => {
    try {
      const data = await authFetch<LoyaltyProgram>("get", "/loyalty/program");
      setProgram(data);
      setConfigForm({
        name: data.name,
        pointsPerDollar: String(data.pointsPerDollar),
        pointValue: String(data.pointValue),
        minRedemption: String(data.minRedemption),
        expirationDays: data.expirationDays != null ? String(data.expirationDays) : "",
        tiers: data.tiers || [
          { name: "Bronce", minPoints: 0, multiplier: 1 },
          { name: "Plata", minPoints: 500, multiplier: 1.5 },
          { name: "Oro", minPoints: 2000, multiplier: 2 },
        ],
      });
    } catch {
      // silent
    }
  }, [authFetch]);

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await authFetch<DashboardData>("get", "/loyalty/dashboard");
      setDashboard(data);
    } catch {
      // silent
    }
  }, [authFetch]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchCustomers(),
      fetchRewards(),
      fetchProgram(),
      fetchDashboard(),
    ]);
    setLoading(false);
  }, [fetchCustomers, fetchRewards, fetchProgram, fetchDashboard]);

  useEffect(() => {
    if (!authLoading) fetchAll();
  }, [authLoading, fetchAll]);

  // -----------------------------------------------------------------------
  // Customer detail
  // -----------------------------------------------------------------------

  const openCustomerDetail = useCallback(
    async (customerId: string) => {
      try {
        const data = await authFetch<CustomerDetail>(
          "get",
          `/loyalty/customers/${customerId}`,
        );
        setSelectedCustomer(data);
        setShowCustomerDetail(true);
      } catch {
        toast("Error al cargar detalle del cliente", "error");
      }
    },
    [authFetch, toast],
  );

  // -----------------------------------------------------------------------
  // Earn points
  // -----------------------------------------------------------------------

  const handleEarn = async () => {
    if (!earnForm.customerId || !earnForm.amount) return;
    setSaving(true);
    try {
      const res = await authFetch<{ pointsEarned: number; newBalance: number }>(
        "post",
        "/loyalty/earn",
        {
          customerId: earnForm.customerId,
          amount: parseFloat(earnForm.amount),
        },
      );
      toast(
        `+${fmtNum(res.pointsEarned)} puntos. Nuevo balance: ${fmtNum(res.newBalance)}`,
        "success",
      );
      setShowEarnModal(false);
      setEarnForm({ customerId: "", amount: "" });
      fetchCustomers();
      fetchDashboard();
      if (selectedCustomer?.id === earnForm.customerId) {
        openCustomerDetail(earnForm.customerId);
      }
    } catch (err: any) {
      toast(err.message || "Error al asignar puntos", "error");
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Redeem points
  // -----------------------------------------------------------------------

  const handleRedeem = async () => {
    if (!redeemForm.customerId) return;
    if (!redeemForm.rewardId && !redeemForm.points) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        customerId: redeemForm.customerId,
      };
      if (redeemForm.rewardId) body.rewardId = redeemForm.rewardId;
      else body.points = parseInt(redeemForm.points, 10);

      const res = await authFetch<{
        pointsRedeemed: number;
        newBalance: number;
      }>("post", "/loyalty/redeem", body);
      toast(
        `Canjeados ${fmtNum(res.pointsRedeemed)} puntos. Balance: ${fmtNum(res.newBalance)}`,
        "success",
      );
      setShowRedeemModal(false);
      setRedeemForm({ customerId: "", rewardId: "", points: "" });
      fetchCustomers();
      fetchRewards();
      fetchDashboard();
      if (selectedCustomer?.id === redeemForm.customerId) {
        openCustomerDetail(redeemForm.customerId);
      }
    } catch (err: any) {
      toast(err.message || "Error al canjear puntos", "error");
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Adjust points
  // -----------------------------------------------------------------------

  const handleAdjust = async () => {
    if (!adjustForm.customerId || !adjustForm.points) return;
    setSaving(true);
    try {
      const res = await authFetch<{ newBalance: number }>(
        "post",
        "/loyalty/adjust",
        {
          customerId: adjustForm.customerId,
          points: parseInt(adjustForm.points, 10),
          description: adjustForm.description || undefined,
        },
      );
      toast(`Ajuste aplicado. Nuevo balance: ${fmtNum(res.newBalance)}`, "success");
      setShowAdjustModal(false);
      setAdjustForm({ customerId: "", points: "", description: "" });
      fetchCustomers();
      fetchDashboard();
      if (selectedCustomer?.id === adjustForm.customerId) {
        openCustomerDetail(adjustForm.customerId);
      }
    } catch (err: any) {
      toast(err.message || "Error al ajustar puntos", "error");
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Reward CRUD
  // -----------------------------------------------------------------------

  const openCreateReward = () => {
    setEditingReward(null);
    setRewardForm({
      name: "",
      description: "",
      pointsCost: "",
      category: "PRODUCT",
      maxRedemptions: "",
      validFrom: "",
      validUntil: "",
    });
    setShowRewardModal(true);
  };

  const openEditReward = (r: LoyaltyReward) => {
    setEditingReward(r);
    setRewardForm({
      name: r.name,
      description: r.description || "",
      pointsCost: String(r.pointsCost),
      category: r.category,
      maxRedemptions: r.maxRedemptions != null ? String(r.maxRedemptions) : "",
      validFrom: r.validFrom ? r.validFrom.slice(0, 10) : "",
      validUntil: r.validUntil ? r.validUntil.slice(0, 10) : "",
    });
    setShowRewardModal(true);
  };

  const handleSaveReward = async () => {
    if (!rewardForm.name || !rewardForm.pointsCost) return;
    setSaving(true);
    try {
      const body = {
        name: rewardForm.name,
        description: rewardForm.description || undefined,
        pointsCost: parseInt(rewardForm.pointsCost, 10),
        category: rewardForm.category,
        maxRedemptions: rewardForm.maxRedemptions
          ? parseInt(rewardForm.maxRedemptions, 10)
          : undefined,
        validFrom: rewardForm.validFrom || undefined,
        validUntil: rewardForm.validUntil || undefined,
      };

      if (editingReward) {
        await authFetch("patch", `/loyalty/rewards/${editingReward.id}`, body);
        toast("Recompensa actualizada", "success");
      } else {
        await authFetch("post", "/loyalty/rewards", body);
        toast("Recompensa creada", "success");
      }
      setShowRewardModal(false);
      fetchRewards();
    } catch (err: any) {
      toast(err.message || "Error al guardar recompensa", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivateReward = async (id: string) => {
    try {
      await authFetch("delete", `/loyalty/rewards/${id}`);
      toast("Recompensa desactivada", "success");
      fetchRewards();
    } catch (err: any) {
      toast(err.message || "Error al desactivar recompensa", "error");
    }
  };

  // -----------------------------------------------------------------------
  // Program config save
  // -----------------------------------------------------------------------

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await authFetch("put", "/loyalty/program", {
        name: configForm.name,
        pointsPerDollar: parseInt(configForm.pointsPerDollar, 10),
        pointValue: parseFloat(configForm.pointValue),
        minRedemption: parseInt(configForm.minRedemption, 10),
        expirationDays: configForm.expirationDays
          ? parseInt(configForm.expirationDays, 10)
          : null,
        tiers: configForm.tiers,
      });
      toast("Configuracion guardada", "success");
      fetchProgram();
    } catch (err: any) {
      toast(err.message || "Error al guardar configuracion", "error");
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Filtered customers
  // -----------------------------------------------------------------------

  const filteredCustomers = useMemo(() => {
    let list = customers;
    if (tierFilter !== "all") {
      list = list.filter((c) => c.loyaltyTier === tierFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)),
      );
    }
    return list;
  }, [customers, tierFilter, search]);

  // -----------------------------------------------------------------------
  // Render guard
  // -----------------------------------------------------------------------

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Cargando...
      </div>
    );
  }

  // =======================================================================
  // RENDER
  // =======================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Programa de Lealtad
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {program?.name || "Luka Rewards"} &mdash; Gestiona puntos, canjes y
            recompensas
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-black text-black"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ================================================================= */}
      {/* TAB: MIEMBROS                                                     */}
      {/* ================================================================= */}
      {tab === "miembros" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar miembro..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full sm:w-64 pl-10 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="all">Todos los tiers</option>
                <option value="Bronce">Bronce</option>
                <option value="Plata">Plata</option>
                <option value="Oro">Oro</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setEarnForm({ customerId: "", amount: "" });
                  setShowEarnModal(true);
                }}
              >
                <ArrowUpCircle className="h-4 w-4" /> Asignar Puntos
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRedeemForm({ customerId: "", rewardId: "", points: "" });
                  setShowRedeemModal(true);
                }}
              >
                <Gift className="h-4 w-4" /> Canjear
              </Button>
            </div>
          </div>

          {/* Members table */}
          <DataTable
            columns={[
              { key: "name", header: "Nombre" },
              {
                key: "email",
                header: "Email",
                render: (r: LoyaltyCustomer) => (
                  <span className="text-gray-500">{r.email || "-"}</span>
                ),
              },
              {
                key: "phone",
                header: "Telefono",
                render: (r: LoyaltyCustomer) => (
                  <span className="text-gray-500">{r.phone || "-"}</span>
                ),
              },
              {
                key: "loyaltyPoints",
                header: "Puntos",
                render: (r: LoyaltyCustomer) => (
                  <span className="font-semibold">
                    {fmtNum(r.loyaltyPoints)}
                  </span>
                ),
              },
              {
                key: "loyaltyTier",
                header: "Tier",
                render: (r: LoyaltyCustomer) => (
                  <TierBadge tier={r.loyaltyTier} />
                ),
              },
              {
                key: "lastActivity",
                header: "Ultima actividad",
                render: (r: LoyaltyCustomer) =>
                  r.loyaltyTransactions.length > 0
                    ? fmtDate(r.loyaltyTransactions[0].createdAt)
                    : "-",
              },
            ]}
            data={filteredCustomers}
            emptyMessage="No hay miembros registrados"
            onRowClick={(r) => openCustomerDetail(r.id)}
          />
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB: RECOMPENSAS                                                  */}
      {/* ================================================================= */}
      {tab === "recompensas" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {rewards.length} recompensa{rewards.length !== 1 ? "s" : ""}{" "}
              configuradas
            </p>
            <Button size="sm" onClick={openCreateReward}>
              <Plus className="h-4 w-4" /> Nueva Recompensa
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rewards.map((r) => (
              <div
                key={r.id}
                className={`bg-white rounded-xl border p-5 space-y-3 ${
                  !r.isActive ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                      <Gift className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{r.name}</h3>
                      <p className="text-xs text-gray-500">
                        {CATEGORY_LABELS[r.category] || r.category}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    label={r.isActive ? "Activa" : "Inactiva"}
                    variant={r.isActive ? "green" : "red"}
                  />
                </div>

                {r.description && (
                  <p className="text-sm text-gray-600">{r.description}</p>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-black">
                    {fmtNum(r.pointsCost)} pts
                  </span>
                  <span className="text-gray-500">
                    {r.currentRedemptions}
                    {r.maxRedemptions != null
                      ? ` / ${r.maxRedemptions}`
                      : ""}{" "}
                    canjes
                  </span>
                </div>

                {(r.validFrom || r.validUntil) && (
                  <p className="text-xs text-gray-400">
                    {r.validFrom ? `Desde ${fmtDate(r.validFrom)}` : ""}
                    {r.validFrom && r.validUntil ? " " : ""}
                    {r.validUntil ? `Hasta ${fmtDate(r.validUntil)}` : ""}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditReward(r)}
                  >
                    <Pencil className="h-3 w-3" /> Editar
                  </Button>
                  {r.isActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDeactivateReward(r.id)}
                    >
                      <Trash2 className="h-3 w-3" /> Desactivar
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {rewards.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400">
                <Gift className="h-10 w-10 mb-2" />
                <p>No hay recompensas configuradas</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB: DASHBOARD                                                    */}
      {/* ================================================================= */}
      {tab === "dashboard" && dashboard && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Total Miembros"
              value={fmtNum(dashboard.totalMembers)}
              icon={Users}
            />
            <KpiCard
              label="Miembros Activos"
              value={fmtNum(dashboard.activeMembers)}
              icon={TrendingUp}
              sub={`${dashboard.totalMembers > 0 ? Math.round((dashboard.activeMembers / dashboard.totalMembers) * 100) : 0}% del total`}
            />
            <KpiCard
              label="Puntos en Circulacion"
              value={fmtNum(dashboard.pointsInCirculation)}
              icon={Star}
            />
            <KpiCard
              label="Canjes este Mes"
              value={fmtNum(dashboard.pointsRedeemedThisMonth)}
              icon={Gift}
              sub={`${fmtNum(dashboard.pointsEarnedThisMonth)} otorgados`}
            />
          </div>

          {/* Charts row */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Tier distribution pie */}
            <div className="bg-white rounded-xl border p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Distribucion por Tier
              </h3>
              {dashboard.tierDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={dashboard.tierDistribution}
                      dataKey="count"
                      nameKey="tier"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ tier, count }) => `${tier}: ${count}`}
                    >
                      {dashboard.tierDistribution.map((_, i) => (
                        <Cell
                          key={i}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">
                  Sin datos
                </p>
              )}
            </div>

            {/* Points earned vs redeemed bar */}
            <div className="bg-white rounded-xl border p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Puntos Otorgados vs Canjeados (mes actual)
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={[
                    {
                      name: "Otorgados",
                      value: dashboard.pointsEarnedThisMonth,
                    },
                    {
                      name: "Canjeados",
                      value: dashboard.pointsRedeemedThisMonth,
                    },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#000000" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top redeemers table */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Top 5 Miembros por Puntos
            </h3>
            <DataTable
              columns={[
                { key: "name", header: "Nombre" },
                {
                  key: "points",
                  header: "Puntos",
                  render: (r: DashboardData["topRedeemers"][0]) => (
                    <span className="font-semibold">{fmtNum(r.points)}</span>
                  ),
                },
                {
                  key: "tier",
                  header: "Tier",
                  render: (r: DashboardData["topRedeemers"][0]) => (
                    <TierBadge tier={r.tier} />
                  ),
                },
              ]}
              data={dashboard.topRedeemers}
              emptyMessage="Sin datos"
            />
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB: CONFIGURACION                                                */}
      {/* ================================================================= */}
      {tab === "configuracion" && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-white rounded-xl border p-6 space-y-5">
            <h3 className="font-semibold text-gray-900">
              Configuracion del Programa
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Nombre del programa">
                <Input
                  value={configForm.name}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, name: e.target.value })
                  }
                />
              </FormField>
              <FormField label="Puntos por $1 MXN gastado">
                <Input
                  type="number"
                  min={1}
                  value={configForm.pointsPerDollar}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      pointsPerDollar: e.target.value,
                    })
                  }
                />
              </FormField>
              <FormField label="Valor por punto ($)">
                <Input
                  type="number"
                  min={0.001}
                  step={0.001}
                  value={configForm.pointValue}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      pointValue: e.target.value,
                    })
                  }
                />
              </FormField>
              <FormField label="Minimo de puntos para canje">
                <Input
                  type="number"
                  min={1}
                  value={configForm.minRedemption}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      minRedemption: e.target.value,
                    })
                  }
                />
              </FormField>
              <FormField label="Dias de expiracion (vacio = sin exp.)">
                <Input
                  type="number"
                  min={1}
                  value={configForm.expirationDays}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      expirationDays: e.target.value,
                    })
                  }
                  placeholder="Sin expiracion"
                />
              </FormField>
            </div>
          </div>

          {/* Tiers */}
          <div className="bg-white rounded-xl border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                Configuracion de Tiers
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setConfigForm({
                    ...configForm,
                    tiers: [
                      ...configForm.tiers,
                      {
                        name: `Tier ${configForm.tiers.length + 1}`,
                        minPoints: 0,
                        multiplier: 1,
                      },
                    ],
                  })
                }
              >
                <Plus className="h-4 w-4" /> Agregar Tier
              </Button>
            </div>

            <div className="space-y-3">
              {configForm.tiers.map((tier, i) => (
                <div
                  key={i}
                  className="grid grid-cols-4 gap-3 items-end border rounded-lg p-3"
                >
                  <FormField label="Nombre">
                    <Input
                      value={tier.name}
                      onChange={(e) => {
                        const updated = [...configForm.tiers];
                        updated[i] = { ...updated[i], name: e.target.value };
                        setConfigForm({ ...configForm, tiers: updated });
                      }}
                    />
                  </FormField>
                  <FormField label="Puntos minimos">
                    <Input
                      type="number"
                      min={0}
                      value={tier.minPoints}
                      onChange={(e) => {
                        const updated = [...configForm.tiers];
                        updated[i] = {
                          ...updated[i],
                          minPoints: parseInt(e.target.value, 10) || 0,
                        };
                        setConfigForm({ ...configForm, tiers: updated });
                      }}
                    />
                  </FormField>
                  <FormField label="Multiplicador">
                    <Input
                      type="number"
                      min={1}
                      step={0.1}
                      value={tier.multiplier}
                      onChange={(e) => {
                        const updated = [...configForm.tiers];
                        updated[i] = {
                          ...updated[i],
                          multiplier: parseFloat(e.target.value) || 1,
                        };
                        setConfigForm({ ...configForm, tiers: updated });
                      }}
                    />
                  </FormField>
                  <div className="flex items-end pb-0.5">
                    {configForm.tiers.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500"
                        onClick={() => {
                          const updated = configForm.tiers.filter(
                            (_, j) => j !== i,
                          );
                          setConfigForm({ ...configForm, tiers: updated });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveConfig} disabled={saving}>
              {saving ? "Guardando..." : "Guardar Configuracion"}
            </Button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: Customer Detail                                            */}
      {/* ================================================================= */}
      <Modal
        open={showCustomerDetail}
        onClose={() => setShowCustomerDetail(false)}
        title={selectedCustomer?.name || "Detalle del Cliente"}
        wide
      >
        {selectedCustomer && (
          <div className="space-y-5">
            {/* Summary */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">
                  {fmtNum(selectedCustomer.loyaltyPoints)}
                </p>
                <p className="text-xs text-gray-500">Balance de Puntos</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <TierBadge tier={selectedCustomer.loyaltyTier} />
                <p className="text-xs text-gray-500 mt-1">Tier Actual</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">
                  {fmtNum(selectedCustomer.totalPointsEarned)}
                </p>
                <p className="text-xs text-gray-500">Total Ganados</p>
              </div>
            </div>

            {/* Progress to next tier */}
            {selectedCustomer.nextTier && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">
                    Progreso hacia{" "}
                    <span className="font-semibold">
                      {selectedCustomer.nextTier.name}
                    </span>
                  </span>
                  <span className="text-gray-500">
                    Faltan {fmtNum(selectedCustomer.pointsToNextTier)} pts
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-black rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        ((selectedCustomer.totalPointsEarned -
                          (selectedCustomer.currentTier?.minPoints || 0)) /
                          (selectedCustomer.nextTier.minPoints -
                            (selectedCustomer.currentTier?.minPoints || 0))) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setEarnForm({
                    customerId: selectedCustomer.id,
                    amount: "",
                  });
                  setShowEarnModal(true);
                }}
              >
                <ArrowUpCircle className="h-4 w-4" /> Asignar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRedeemForm({
                    customerId: selectedCustomer.id,
                    rewardId: "",
                    points: "",
                  });
                  setShowRedeemModal(true);
                }}
              >
                <Gift className="h-4 w-4" /> Canjear
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAdjustForm({
                    customerId: selectedCustomer.id,
                    points: "",
                    description: "",
                  });
                  setShowAdjustModal(true);
                }}
              >
                <Settings className="h-4 w-4" /> Ajustar
              </Button>
            </div>

            {/* Transaction history */}
            <div>
              <h4 className="text-sm font-semibold mb-3">
                Historial de Transacciones
              </h4>
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b">
                      <th className="text-left px-3 py-2 font-medium text-gray-500">
                        Fecha
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">
                        Tipo
                      </th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">
                        Puntos
                      </th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">
                        Balance
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">
                        Descripcion
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCustomer.loyaltyTransactions.map((tx) => (
                      <tr key={tx.id} className="border-b last:border-0">
                        <td className="px-3 py-2 text-gray-500">
                          {fmtDate(tx.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <TransactionTypeBadge type={tx.type} />
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            tx.points > 0
                              ? "text-green-600"
                              : tx.points < 0
                                ? "text-red-600"
                                : ""
                          }`}
                        >
                          {tx.points > 0 ? "+" : ""}
                          {fmtNum(tx.points)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {fmtNum(tx.balance)}
                        </td>
                        <td className="px-3 py-2 text-gray-500 truncate max-w-[200px]">
                          {tx.description || "-"}
                        </td>
                      </tr>
                    ))}
                    {selectedCustomer.loyaltyTransactions.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-6 text-center text-gray-400"
                        >
                          Sin transacciones
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* MODAL: Earn Points                                                */}
      {/* ================================================================= */}
      <Modal
        open={showEarnModal}
        onClose={() => setShowEarnModal(false)}
        title="Asignar Puntos"
      >
        <div className="space-y-4">
          <FormField label="Cliente" required>
            <Select
              value={earnForm.customerId}
              onChange={(e) =>
                setEarnForm({ ...earnForm, customerId: e.target.value })
              }
            >
              <option value="">Seleccionar cliente...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({fmtNum(c.loyaltyPoints)} pts)
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Monto de compra ($)" required>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              placeholder="0.00"
              value={earnForm.amount}
              onChange={(e) =>
                setEarnForm({ ...earnForm, amount: e.target.value })
              }
            />
          </FormField>
          {earnForm.amount && program && (
            <p className="text-sm text-gray-500">
              Se otorgaran aproximadamente{" "}
              <span className="font-semibold text-black">
                {fmtNum(
                  Math.floor(
                    parseFloat(earnForm.amount || "0") *
                      program.pointsPerDollar,
                  ),
                )}
              </span>{" "}
              puntos base (sin multiplicador de tier)
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowEarnModal(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleEarn} disabled={saving}>
              {saving ? "Procesando..." : "Asignar Puntos"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================================================================= */}
      {/* MODAL: Redeem Points                                              */}
      {/* ================================================================= */}
      <Modal
        open={showRedeemModal}
        onClose={() => setShowRedeemModal(false)}
        title="Canjear Puntos"
      >
        <div className="space-y-4">
          <FormField label="Cliente" required>
            <Select
              value={redeemForm.customerId}
              onChange={(e) =>
                setRedeemForm({ ...redeemForm, customerId: e.target.value })
              }
            >
              <option value="">Seleccionar cliente...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({fmtNum(c.loyaltyPoints)} pts)
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Recompensa (o ingresa puntos abajo)">
            <Select
              value={redeemForm.rewardId}
              onChange={(e) =>
                setRedeemForm({
                  ...redeemForm,
                  rewardId: e.target.value,
                  points: "",
                })
              }
            >
              <option value="">Seleccionar recompensa...</option>
              {rewards
                .filter((r) => r.isActive)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({fmtNum(r.pointsCost)} pts)
                  </option>
                ))}
            </Select>
          </FormField>

          {!redeemForm.rewardId && (
            <FormField label="Puntos a canjear">
              <Input
                type="number"
                min={1}
                value={redeemForm.points}
                onChange={(e) =>
                  setRedeemForm({ ...redeemForm, points: e.target.value })
                }
                placeholder={`Minimo ${program?.minRedemption || 100}`}
              />
            </FormField>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowRedeemModal(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleRedeem} disabled={saving}>
              {saving ? "Procesando..." : "Canjear"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================================================================= */}
      {/* MODAL: Adjust Points                                              */}
      {/* ================================================================= */}
      <Modal
        open={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        title="Ajustar Puntos (Admin)"
      >
        <div className="space-y-4">
          <FormField label="Cliente" required>
            <Select
              value={adjustForm.customerId}
              onChange={(e) =>
                setAdjustForm({ ...adjustForm, customerId: e.target.value })
              }
            >
              <option value="">Seleccionar cliente...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({fmtNum(c.loyaltyPoints)} pts)
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Puntos (+/-)" required>
            <Input
              type="number"
              value={adjustForm.points}
              onChange={(e) =>
                setAdjustForm({ ...adjustForm, points: e.target.value })
              }
              placeholder="Ej: 50 o -20"
            />
          </FormField>
          <FormField label="Descripcion">
            <Textarea
              value={adjustForm.description}
              onChange={(e) =>
                setAdjustForm({ ...adjustForm, description: e.target.value })
              }
              placeholder="Razon del ajuste..."
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowAdjustModal(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleAdjust} disabled={saving}>
              {saving ? "Procesando..." : "Aplicar Ajuste"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================================================================= */}
      {/* MODAL: Create/Edit Reward                                         */}
      {/* ================================================================= */}
      <Modal
        open={showRewardModal}
        onClose={() => setShowRewardModal(false)}
        title={editingReward ? "Editar Recompensa" : "Nueva Recompensa"}
      >
        <div className="space-y-4">
          <FormField label="Nombre" required>
            <Input
              value={rewardForm.name}
              onChange={(e) =>
                setRewardForm({ ...rewardForm, name: e.target.value })
              }
              placeholder="Ej: Bowl gratis"
            />
          </FormField>
          <FormField label="Descripcion">
            <Textarea
              value={rewardForm.description}
              onChange={(e) =>
                setRewardForm({ ...rewardForm, description: e.target.value })
              }
              placeholder="Descripcion de la recompensa..."
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Costo en puntos" required>
              <Input
                type="number"
                min={1}
                value={rewardForm.pointsCost}
                onChange={(e) =>
                  setRewardForm({ ...rewardForm, pointsCost: e.target.value })
                }
              />
            </FormField>
            <FormField label="Categoria">
              <Select
                value={rewardForm.category}
                onChange={(e) =>
                  setRewardForm({ ...rewardForm, category: e.target.value })
                }
              >
                <option value="PRODUCT">Producto gratis</option>
                <option value="DISCOUNT">Descuento</option>
                <option value="FREEBIE">Complemento</option>
              </Select>
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Max. canjes (vacio = ilimitado)">
              <Input
                type="number"
                min={1}
                value={rewardForm.maxRedemptions}
                onChange={(e) =>
                  setRewardForm({
                    ...rewardForm,
                    maxRedemptions: e.target.value,
                  })
                }
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Valida desde">
              <Input
                type="date"
                value={rewardForm.validFrom}
                onChange={(e) =>
                  setRewardForm({ ...rewardForm, validFrom: e.target.value })
                }
              />
            </FormField>
            <FormField label="Valida hasta">
              <Input
                type="date"
                value={rewardForm.validUntil}
                onChange={(e) =>
                  setRewardForm({ ...rewardForm, validUntil: e.target.value })
                }
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowRewardModal(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveReward} disabled={saving}>
              {saving
                ? "Guardando..."
                : editingReward
                  ? "Actualizar"
                  : "Crear Recompensa"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string;
  icon: any;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
          <Icon className="h-4 w-4 text-gray-600" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function TransactionTypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; variant: string }> = {
    EARN: { label: "Ganado", variant: "green" },
    REDEEM: { label: "Canjeado", variant: "red" },
    ADJUST: { label: "Ajuste", variant: "blue" },
    EXPIRE: { label: "Expirado", variant: "yellow" },
    BONUS: { label: "Bonus", variant: "purple" },
  };
  const c = config[type] || { label: type, variant: "gray" };
  return <StatusBadge label={c.label} variant={c.variant as any} />;
}
