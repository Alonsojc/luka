"use client";

import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, BarChart3, Bell, Menu } from "lucide-react";

const NAV_ITEMS = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Inventarios", href: "/inventarios", icon: Package },
  { name: "Reportes", href: "/reportes", icon: BarChart3 },
  { name: "Alertas", href: "/alertas", icon: Bell },
];

export function BottomNav({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname() ?? "";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-border bg-card py-1 safe-area-pb lg:hidden">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <a
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 min-w-[64px] rounded-lg transition-colors ${
              isActive ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <Icon className={`h-5 w-5 ${isActive ? "text-foreground" : ""}`} />
            <span className="text-[10px] font-medium">{item.name}</span>
          </a>
        );
      })}
      <button
        onClick={onMenuClick}
        className="flex flex-col items-center gap-0.5 px-3 py-2 min-w-[64px] rounded-lg text-muted-foreground transition-colors"
      >
        <Menu className="h-5 w-5" />
        <span className="text-[10px] font-medium">Menu</span>
      </button>
    </nav>
  );
}
