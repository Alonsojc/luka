"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser, clearAuth, setAuth, type AuthUser } from "@/lib/auth";
import { api, ApiError } from "@/lib/api-client";

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getToken();
    const u = getUser();
    if (!t || !u) {
      router.push("/login");
      return;
    }
    setToken(t);
    setUser(u);
    setLoading(false);
  }, [router]);

  const logout = useCallback(() => {
    if (token) {
      api.post("/auth/logout", {}, { token }).catch(() => {});
    }
    clearAuth();
    router.push("/login");
  }, [token, router]);

  const authFetch = useCallback(
    async <T>(method: "get" | "post" | "patch" | "put" | "delete", path: string, body?: unknown): Promise<T> => {
      if (!token) throw new Error("No autenticado");
      try {
        if (method === "get" || method === "delete") {
          return await api[method]<T>(path, { token });
        }
        return await api[method]<T>(path, body, { token });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAuth();
          router.push("/login");
        }
        throw err;
      }
    },
    [token, router]
  );

  return { user, token, loading, logout, authFetch };
}
