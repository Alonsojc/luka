"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getUser } from "@/lib/auth";
import { canAccessRoute } from "@/lib/permissions";

/**
 * Redirect users away from routes they lack permission for.
 * Call this once in the dashboard layout so every page is protected.
 */
export function useRouteGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const user = getUser();
    if (!user) return; // auth redirect is handled elsewhere
    if (!canAccessRoute(user, pathname)) {
      router.replace("/dashboard");
    }
  }, [pathname, router]);
}
