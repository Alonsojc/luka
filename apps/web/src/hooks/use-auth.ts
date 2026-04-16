"use client";

import { useEffect, useLayoutEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getUser, clearAuth, type AuthUser } from "@/lib/auth";
import { api, ApiError } from "@/lib/api-client";

/**
 * Safe version of useLayoutEffect that falls back to useEffect during SSR.
 * useLayoutEffect warns when called on the server because there is no DOM to
 * measure, but useEffect fires too late (after paint) and causes a visible
 * flash of the "loading" state.
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Provides auth state (user, loading) plus helpers (logout, authFetch).
 *
 * `loading` starts as `true` and transitions to `false` once the hook
 * has checked localStorage for a persisted user.  We use
 * `useLayoutEffect` on the client so the state flip happens
 * **synchronously before the browser paints**.  This prevents pages
 * from flashing a "Cargando..." placeholder that Playwright (or users)
 * might observe as a stuck loading state.
 */
export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const resolved = useRef(false);

  // Resolve auth synchronously before paint so consumers never see
  // loading=true when localStorage already contains a valid user.
  useIsomorphicLayoutEffect(() => {
    if (resolved.current) return;
    resolved.current = true;

    const u = getUser();
    if (!u) {
      router.push("/login");
      return;
    }
    setUser(u);
    setLoading(false);
  }, [router]);

  const logout = useCallback(() => {
    api.post("/auth/logout", {}).catch(() => {});
    clearAuth();
    router.push("/login");
  }, [router]);

  const authFetch = useCallback(
    async <T>(
      method: "get" | "post" | "patch" | "put" | "delete",
      path: string,
      body?: unknown,
    ): Promise<T> => {
      try {
        if (method === "get" || method === "delete") {
          return await api[method]<T>(path);
        }
        return await api[method]<T>(path, body);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAuth();
          router.push("/login");
        }
        throw err;
      }
    },
    [router],
  );

  return { user, loading, logout, authFetch };
}
