const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

interface ApiOptions extends RequestInit {
  token?: string;
  skipRefresh?: boolean;
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
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const refreshToken = localStorage.getItem("luka_refresh_token");
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (data.accessToken) {
      localStorage.setItem("luka_access_token", data.accessToken);
      // Store rotated refresh token if provided
      if (data.refreshToken) {
        localStorage.setItem("luka_refresh_token", data.refreshToken);
      }
      return data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

async function getValidToken(currentToken?: string): Promise<string | null> {
  if (!currentToken) return null;

  // Reuse in-flight refresh
  if (refreshPromise) return refreshPromise;

  // Check if token is about to expire (within 2 minutes)
  try {
    const payload = JSON.parse(atob(currentToken.split(".")[1]));
    const expiresIn = payload.exp * 1000 - Date.now();
    if (expiresIn > 120_000) return currentToken; // Still valid for >2min
  } catch {
    return currentToken; // Can't parse, let the server decide
  }

  // Token expiring soon — refresh proactively
  refreshPromise = refreshAccessToken().finally(() => {
    refreshPromise = null;
  });

  return (await refreshPromise) || currentToken;
}

async function request<T>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const { token, skipRefresh, ...fetchOptions } = options;

  // Proactively refresh if token is close to expiry
  const validToken = skipRefresh ? token : await getValidToken(token || undefined);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (validToken) {
    headers.Authorization = `Bearer ${validToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  // 401 — attempt refresh once and retry
  if (res.status === 401 && token && !skipRefresh) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const newToken = await refreshPromise;

    if (newToken) {
      return request<T>(path, { ...options, token: newToken, skipRefresh: true });
    }

    // Refresh failed — clear auth and redirect
    if (typeof window !== "undefined") {
      localStorage.removeItem("luka_access_token");
      localStorage.removeItem("luka_refresh_token");
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
