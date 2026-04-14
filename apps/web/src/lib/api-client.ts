const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: string;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Prevent multiple simultaneous refresh attempts
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    return res.ok;
  } catch {
    return false;
  }
}

async function request<T>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include", // Send httpOnly cookies automatically
  });

  // 401 — attempt refresh once and retry
  if (res.status === 401 && !path.includes("/auth/refresh")) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const refreshed = await refreshPromise;

    if (refreshed) {
      // Retry the original request with fresh cookies
      const retryRes = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });

      if (retryRes.ok) {
        if (retryRes.status === 204) return undefined as T;
        return retryRes.json();
      }
    }

    // Refresh failed — clear auth and redirect
    if (typeof window !== "undefined") {
      localStorage.removeItem("luka_user");
      window.location.href = "/login";
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message || res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string, opts?: ApiOptions) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body: unknown, opts?: ApiOptions) =>
    request<T>(path, { ...opts, method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown, opts?: ApiOptions) =>
    request<T>(path, { ...opts, method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown, opts?: ApiOptions) =>
    request<T>(path, { ...opts, method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string, opts?: ApiOptions) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};

export { ApiError };
