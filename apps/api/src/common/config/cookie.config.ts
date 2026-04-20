import type { CookieOptions } from "express";

const isProduction = process.env.NODE_ENV === "production";

/** Shared cookie settings for all auth cookies. */
const BASE: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
};

/** Access token cookie — short-lived, sent on every API request. */
export const ACCESS_COOKIE_NAME = "luka_access";
export const accessCookieOptions: CookieOptions = {
  ...BASE,
  path: "/api",
  maxAge: parseExpiration(process.env.JWT_EXPIRATION || "20h"),
};

/** Refresh token cookie — long-lived, only sent to the refresh endpoint. */
export const REFRESH_COOKIE_NAME = "luka_refresh";
export const refreshCookieOptions: CookieOptions = {
  ...BASE,
  path: "/api/auth/refresh",
  maxAge: parseExpiration(process.env.JWT_REFRESH_EXPIRATION || "7d"),
};

/** CSRF token cookie — non-httpOnly so JS can read it and echo as header. */
export const csrfCookieOptions: CookieOptions = {
  httpOnly: false, // Must be readable by JS
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
  maxAge: parseExpiration(process.env.JWT_EXPIRATION || "20h"),
};

/** Options to clear a cookie (set maxAge to 0). */
export function clearCookieOptions(path: string): CookieOptions {
  return { ...BASE, path, maxAge: 0 };
}

/** Convert "20h" / "7d" / "15m" strings to milliseconds. */
function parseExpiration(exp: string): number {
  const match = exp.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 20 * 60 * 60 * 1000; // default 20h
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 20 * 60 * 60 * 1000;
  }
}
