"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Bell, BellOff, BellRing, X } from "lucide-react";
import { getUser } from "@/lib/auth";

type PermissionState = "default" | "granted" | "denied" | "unsupported";

/**
 * Manages browser push notifications.
 * - Connects to the existing WebSocket notification gateway
 * - When a notification arrives via WS AND browser permission is granted,
 *   shows a native browser Notification
 * - Provides a button to request permission
 */
export function PushNotificationManager() {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [showBanner, setShowBanner] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedKey = "luka-push-dismissed";

  // Check notification support and permission
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    const perm = (window as any).Notification.permission as PermissionState;
    setPermission(perm);

    // Show banner if never asked
    if (perm === "default" && !localStorage.getItem(dismissedKey)) {
      const timer = setTimeout(() => setShowBanner(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Show native notification
  const showNativeNotification = useCallback(
    (title: string, body: string, link?: string | null) => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if ((window as any).Notification.permission !== "granted") return;

      const notification = new (window as any).Notification(title, {
        body,
        icon: "/luka-logo.png",
        badge: "/luka-logo.png",
        tag: `luka-${Date.now()}`,
      });

      notification.onclick = () => {
        window.focus();
        if (link) window.location.href = link;
        notification.close();
      };
    },
    [],
  );

  // Connect to WebSocket notification gateway
  const connectWS = useCallback(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if ((window as any).Notification.permission !== "granted") return;

    const user = getUser();
    if (!user) return;
    const userId = user.id;

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host =
      process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, "").replace("/api", "") ||
      "localhost:3001";
    const wsUrl = `${protocol}//${host}/notifications?userId=${userId}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "notification" && data.data) {
            const n = data.data;
            showNativeNotification(n.title, n.message, n.link);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        // Reconnect after 10s
        reconnectTimer.current = setTimeout(connectWS, 10000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // WS connection failed, will retry
    }
  }, [showNativeNotification]);

  // Connect WS when permission is granted
  useEffect(() => {
    if (permission === "granted") {
      connectWS();
    }
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [permission, connectWS]);

  // Also register for SW push events
  useEffect(() => {
    if (
      permission !== "granted" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    )
      return;

    navigator.serviceWorker.ready.then((registration) => {
      // Check if push manager is available
      if (!registration.pushManager) return;

      // We use the WS approach primarily, SW push is for background
      registration.pushManager.getSubscription().catch(() => {});
    });
  }, [permission]);

  const handleRequestPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await (window as any).Notification.requestPermission();
    setPermission(result as PermissionState);
    setShowBanner(false);
    if (result === "granted") {
      connectWS();
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem(dismissedKey, "true");
  };

  if (!showBanner || permission !== "default") return null;

  return (
    <div className="fixed bottom-16 left-4 right-4 z-50 sm:left-auto sm:right-6 sm:w-96 animate-in slide-in-from-bottom-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black shrink-0">
            <BellRing className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Activar notificaciones</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Recibe alertas en tiempo real sobre inventario bajo, requisiciones urgentes y mas.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleRequestPermission}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
              >
                Activar
              </button>
              <button
                onClick={handleDismiss}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
              >
                Ahora no
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Small toggle button for notification permission in the header.
 */
export function PushToggle() {
  const [permission, setPermission] = useState<PermissionState>("default");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission((window as any).Notification.permission as PermissionState);
  }, []);

  const handleToggle = async () => {
    if (permission === "unsupported" || permission === "denied") return;
    if (permission === "default") {
      const result = await (window as any).Notification.requestPermission();
      setPermission(result as PermissionState);
    }
  };

  if (permission === "unsupported") return null;

  return (
    <button
      onClick={handleToggle}
      className={`rounded-lg p-1.5 transition-colors ${
        permission === "granted"
          ? "text-green-600 hover:bg-green-50"
          : permission === "denied"
            ? "text-red-400 cursor-not-allowed"
            : "text-muted-foreground hover:bg-muted"
      }`}
      title={
        permission === "granted"
          ? "Notificaciones activadas"
          : permission === "denied"
            ? "Notificaciones bloqueadas (cambia en ajustes del navegador)"
            : "Activar notificaciones push"
      }
    >
      {permission === "granted" ? (
        <BellRing className="h-4 w-4" />
      ) : permission === "denied" ? (
        <BellOff className="h-4 w-4" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
    </button>
  );
}
