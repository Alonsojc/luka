const LOCAL_API_URL = "http://localhost:3001/api";
const PRODUCTION_API_URL = "/api";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function stripApiPath(value: string): string {
  return trimTrailingSlash(value).replace(/\/api$/, "");
}

export function getApiUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configuredUrl) return trimTrailingSlash(configuredUrl);

  return process.env.NODE_ENV === "production" ? PRODUCTION_API_URL : LOCAL_API_URL;
}

export function getApiOrigin(): string {
  const apiUrl = getApiUrl();
  if (apiUrl.startsWith("/")) return "";
  return stripApiPath(apiUrl);
}

export function getNotificationsWsUrl(userId: string): string {
  const configuredWsUrl = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (configuredWsUrl) {
    return `${trimTrailingSlash(configuredWsUrl)}/notifications?userId=${userId}`;
  }

  const apiUrl = getApiUrl();
  if (apiUrl.startsWith("https://")) {
    return `wss://${stripApiPath(apiUrl).replace(/^https:\/\//, "")}/notifications?userId=${userId}`;
  }
  if (apiUrl.startsWith("http://")) {
    return `ws://${stripApiPath(apiUrl).replace(/^http:\/\//, "")}/notifications?userId=${userId}`;
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/notifications?userId=${userId}`;
  }

  return process.env.NODE_ENV === "production"
    ? ""
    : `ws://localhost:3001/notifications?userId=${userId}`;
}
