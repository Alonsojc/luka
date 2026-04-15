"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { getUser } from "@/lib/auth";
import { api } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface UseNotificationsWsReturn {
  /** Whether the WebSocket connection is currently active. */
  isConnected: boolean;
  /** The most recent notification received via WebSocket. */
  lastNotification: Notification | null;
  /** Current unread count (updated by WS events and polling fallback). */
  unreadCount: number;
  /** Force a manual refresh of the unread count. */
  refreshCount: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";
const POLLING_INTERVAL_MS = 30_000; // 30 seconds fallback
const RECONNECT_DELAY_MS = 5_000; // retry after 5 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Real-time notifications hook.
 *
 * Attempts to connect to the backend WebSocket gateway at
 * `${WS_BASE_URL}/notifications`. If the connection fails or
 * `socket.io-client` is unavailable, it falls back to HTTP polling
 * every 30 seconds.
 *
 * NOTE: The backend gateway now validates JWT on connection. When
 * socket.io-client is installed, pass the access token via
 * `auth: { token }` in the handshake (the cookie will also work
 * for same-origin connections).
 */
export function useNotificationsWs(): UseNotificationsWsReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastNotification, setLastNotification] = useState<Notification | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Fetch unread count via HTTP -----------------------------------------
  const fetchUnreadCount = useCallback(async () => {
    const user = getUser();
    if (!user) return;
    try {
      const data = await api.get<{ count: number }>("/notifications/unread-count");
      setUnreadCount(data.count);
    } catch {
      // silent fail — network might be down
    }
  }, []);

  // --- WebSocket connection (best-effort) ----------------------------------
  const connectWs = useCallback(() => {
    const user = getUser();
    if (!user) return;

    // Socket.IO uses a custom HTTP-upgrade handshake that a raw WebSocket
    // cannot replicate. We attempt a native WS connection, but it will only
    // succeed if the server also supports raw WS. Otherwise we rely on
    // the polling fallback.
    try {
      const url = `${WS_BASE_URL}/notifications?userId=${user.id}`;
      const ws = new WebSocket(url.replace(/^http/, "ws"));

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.id) {
            setLastNotification(payload as Notification);
            setUnreadCount((prev) => prev + 1);
          }
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onerror = () => {
        // Will trigger onclose, handled there
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        // Attempt reconnect with backoff
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_DELAY_MS * Math.pow(1.5, reconnectAttempts.current);
          reconnectAttempts.current += 1;
          reconnectTimer.current = setTimeout(connectWs, delay);
        }
      };

      wsRef.current = ws;
    } catch {
      // WebSocket constructor failed — stay in polling mode
      setIsConnected(false);
    }
  }, []);

  // --- Lifecycle -----------------------------------------------------------
  useEffect(() => {
    const user = getUser();
    if (!user) return;

    // Initial unread count fetch
    fetchUnreadCount();

    // Try WebSocket connection
    connectWs();

    // Always set up polling as fallback / supplement
    pollingTimer.current = setInterval(fetchUnreadCount, POLLING_INTERVAL_MS);

    return () => {
      // Cleanup WebSocket
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      // Cleanup timers
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (pollingTimer.current) {
        clearInterval(pollingTimer.current);
        pollingTimer.current = null;
      }
    };
  }, [connectWs, fetchUnreadCount]);

  return {
    isConnected,
    lastNotification,
    unreadCount,
    refreshCount: fetchUnreadCount,
  };
}
