"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getUser, clearAuth, type AuthUser } from "@/lib/auth";
import { api, ApiError } from "@/lib/api-client";

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(() => getUser());
  const [loading, setLoading] = useState(() => !getUser());

  useEffect(() => {
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
