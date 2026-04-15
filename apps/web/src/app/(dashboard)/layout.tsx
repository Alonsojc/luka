"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getUser, clearAuth, type AuthUser } from "@/lib/auth";
import { canAccessRoute } from "@/lib/permissions";
import { useRouteGuard } from "@/hooks/use-route-guard";
import { api } from "@/lib/api-client";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { PushNotificationManager, PushToggle } from "@/components/notifications/push-manager";
import { BottomNav } from "@/components/layout/bottom-nav";
import {
  Package,
  ShoppingCart,
  Building2,
  Landmark,
  FileText,
  BookOpen,
  Users,
  BarChart3,
  TrendingUp,
  Heart,
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Menu,
  X,
  Bell,
  BellRing,
  Trash2,
  Gift,
  Bike,
  ClipboardList,
  ClipboardCheck,
  ScrollText,
  Briefcase,
  Timer,
  Activity,
  Clock,
  PieChart,
  UserCheck,
  Shield,
  Upload,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

const NAV_SECTIONS = [
  {
    label: "OPERACIONES",
    items: [
      { name: "Inventarios", href: "/inventarios", icon: Package },
      { name: "Compras", href: "/compras", icon: ShoppingCart },
      { name: "Sucursales", href: "/sucursales", icon: Building2 },
      { name: "Razones Sociales", href: "/razones-sociales", icon: Briefcase },
      { name: "Merma", href: "/merma", icon: Trash2 },
      { name: "Delivery", href: "/delivery", icon: Bike },
      { name: "Requisiciones", href: "/requisiciones", icon: ClipboardList },
      { name: "Kardex", href: "/inventarios/kardex", icon: ScrollText },
      { name: "Conteo Fisico", href: "/inventarios/conteo", icon: ClipboardCheck },
      { name: "Caducidad", href: "/inventarios/lotes", icon: Timer },
      { name: "Predicciones", href: "/predicciones", icon: Activity },
      { name: "Horarios", href: "/horarios", icon: Clock },
      { name: "Asistencia", href: "/asistencia", icon: UserCheck },
      { name: "POS Corntech", href: "/pos", icon: Monitor },
    ],
  },
  {
    label: "FINANZAS",
    items: [
      { name: "Bancos", href: "/bancos", icon: Landmark },
      { name: "Facturacion", href: "/facturacion", icon: FileText },
      { name: "Contabilidad", href: "/contabilidad", icon: BookOpen },
      { name: "Nomina", href: "/nomina", icon: Users },
    ],
  },
  {
    label: "ANALYTICS",
    items: [
      { name: "Reportes", href: "/reportes", icon: BarChart3 },
      { name: "Presupuesto", href: "/presupuesto", icon: PieChart },
      { name: "Inversionistas", href: "/inversionistas", icon: TrendingUp },
    ],
  },
  {
    label: "CLIENTES",
    items: [
      { name: "CRM", href: "/crm", icon: Heart },
      { name: "Lealtad", href: "/lealtad", icon: Gift },
    ],
  },
  {
    label: "SISTEMA",
    items: [
      { name: "Alertas", href: "/alertas", icon: BellRing },
      { name: "Notificaciones", href: "/notificaciones", icon: Bell },
      { name: "Auditoria", href: "/auditoria", icon: Shield },
      { name: "Importar Datos", href: "/importar", icon: Upload },
      { name: "Configuracion", href: "/configuracion", icon: Settings },
    ],
  },
];

interface Branch {
  id: string;
  name: string;
  code: string;
  city: string;
}

interface Notification {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  if (hours < 24) return `hace ${hours} hora${hours !== 1 ? "s" : ""}`;
  if (days < 30) return `hace ${days} dia${days !== 1 ? "s" : ""}`;
  return new Date(dateStr).toLocaleDateString("es-MX");
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [branchOpen, setBranchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace("/login");
      return;
    }
    setUser(u);
  }, [router]);

  const fetchBranches = useCallback(async () => {
    try {
      const data = await api.get<Branch[]>("/branches");
      setBranches(data);
    } catch (err) {
      console.error("Failed to fetch branches:", err);
    }
  }, []);

  useEffect(() => {
    if (user) fetchBranches();
  }, [user, fetchBranches]);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.get<{ notifications: Notification[]; total: number }>(
        "/notifications?limit=10",
      );
      setNotifications(data.notifications);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await api.get<{ count: number }>("/notifications/unread-count");
      setUnreadCount(data.count);
    } catch (err) {
      console.error("Failed to fetch unread count:", err);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      fetchUnreadCount();
    }
  }, [user, fetchNotifications, fetchUnreadCount]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [user, fetchUnreadCount]);

  useRouteGuard();

  const visibleSections = useMemo(() => {
    if (!user) return [];
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessRoute(user, item.href)),
    })).filter((section) => section.items.length > 0);
  }, [user]);

  const toggleSection = useCallback((label: string) => {
    setExpandedSections((prev) => ({ ...prev, [label]: !prev[label] }));
  }, []);

  // Auto-expand the section that contains the current route
  useEffect(() => {
    if (!pathname) return;
    for (const section of NAV_SECTIONS) {
      const hasActive = section.items.some((item) => pathname.startsWith(item.href));
      if (hasActive) {
        setExpandedSections((prev) => {
          if (!prev[section.label]) return { ...prev, [section.label]: true };
          return prev;
        });
      }
    }
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500";
      case "warning":
        return "bg-yellow-500";
      case "info":
      default:
        return "bg-blue-500";
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post("/notifications/read-all", {});
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all notifications read:", err);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        await api.post(`/notifications/${notification.id}/read`, {});
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error("Failed to mark notification read:", err);
      }
    }
    setNotificationsOpen(false);
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const handleLogout = () => {
    clearAuth();
    router.replace("/login");
  };

  if (!user) return null;

  const allBranches = [
    { id: "all", name: "Todas las Sucursales", code: "", city: "" },
    ...branches,
  ];
  const currentBranch = allBranches.find((b) => b.id === selectedBranch) || allBranches[0];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-black transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <img src="/luka-logo.png" alt="Luka" className="h-9 w-auto" />
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-white/60 hover:text-white transition-colors lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <a
            href="/dashboard"
            onClick={() => setSidebarOpen(false)}
            className={`mb-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              pathname === "/dashboard"
                ? "bg-white/15 text-white"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            <LayoutDashboard className="h-5 w-5" />
            Dashboard
          </a>

          {visibleSections.map((section) => {
            const isCollapsed = !expandedSections[section.label];
            const hasActiveItem = section.items.some((item) => pathname.startsWith(item.href));
            return (
              <div key={section.label} className="mb-2">
                <button
                  onClick={() => toggleSection(section.label)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-1.5 group transition-colors hover:bg-white/5"
                >
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${
                      hasActiveItem ? "text-white/50" : "text-white/30"
                    } group-hover:text-white/50 transition-colors`}
                  >
                    {section.label}
                  </span>
                  <ChevronDown
                    className={`h-3 w-3 text-white/30 group-hover:text-white/50 transition-transform duration-200 ${
                      isCollapsed ? "-rotate-90" : ""
                    }`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-200 ease-in-out ${
                    isCollapsed ? "max-h-0 opacity-0" : "max-h-[600px] opacity-100"
                  }`}
                >
                  <div className="mt-0.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = pathname.startsWith(item.href);
                      return (
                        <a
                          key={item.href}
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-white/15 text-white"
                              : "text-white/60 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                          {item.name}
                        </a>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black text-xs font-bold">
              {user.firstName.charAt(0)}
              {user.lastName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-white/40 truncate">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-white/40 hover:text-white transition-colors"
              title="Cerrar sesion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-12 sm:h-14 items-center justify-between border-b border-border bg-card px-3 sm:px-4 lg:px-6 overflow-x-auto">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="relative min-w-0">
              <button
                onClick={() => {
                  setBranchOpen(!branchOpen);
                  setNotificationsOpen(false);
                }}
                className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-border px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-foreground hover:bg-muted transition-colors max-w-[180px] sm:max-w-none"
              >
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{currentBranch.name}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
              {branchOpen && (
                <div className="absolute left-0 top-full mt-1 w-64 rounded-lg border border-border bg-card py-1 shadow-lg max-h-80 overflow-y-auto z-50">
                  {allBranches.map((branch) => (
                    <button
                      key={branch.id}
                      onClick={() => {
                        setSelectedBranch(branch.id);
                        setBranchOpen(false);
                      }}
                      className={`block w-full px-4 py-2 text-left text-sm transition-colors ${
                        selectedBranch === branch.id
                          ? "bg-primary/5 text-foreground font-medium"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <span>{branch.name}</span>
                      {branch.city && (
                        <span className="ml-2 text-xs text-muted-foreground">{branch.city}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={toggleTheme}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"
              title={theme === "light" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
            >
              {theme === "light" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <PushToggle />
            <div ref={notificationsRef} className="relative">
              <button
                onClick={() => {
                  setNotificationsOpen(!notificationsOpen);
                  setBranchOpen(false);
                  if (!notificationsOpen) fetchNotifications();
                }}
                className="relative rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-full mt-1 w-80 rounded-lg border border-border bg-card shadow-lg z-50">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h3 className="text-sm font-semibold text-foreground">Notificaciones</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        Marcar todas como leidas
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Sin notificaciones pendientes
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted transition-colors border-b border-border/50 last:border-b-0 ${
                            !n.isRead ? "bg-accent/50" : ""
                          }`}
                        >
                          <span
                            className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${severityColor(n.severity)}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm truncate ${
                                !n.isRead
                                  ? "font-semibold text-foreground"
                                  : "font-medium text-muted-foreground"
                              }`}
                            >
                              {n.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {timeAgo(n.createdAt)}
                            </p>
                          </div>
                          {!n.isRead && (
                            <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  <a
                    href="/notificaciones"
                    onClick={() => setNotificationsOpen(false)}
                    className="block border-t border-border px-4 py-2.5 text-center text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Ver todas
                  </a>
                </div>
              )}
            </div>
          </div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-mono-brand hidden sm:block">
            Luka Poke House
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 pb-20 lg:pb-6">{children}</main>
      </div>
      <BottomNav onMenuClick={() => setSidebarOpen(true)} />
      <PWAInstallPrompt />
      <PushNotificationManager />
    </div>
  );
}
