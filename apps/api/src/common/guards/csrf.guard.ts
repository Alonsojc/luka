import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SKIP_CSRF_KEY } from "../decorators/skip-csrf.decorator";

/** Name of the non-httpOnly cookie the server sets. */
export const CSRF_COOKIE_NAME = "luka_csrf";

/** Header the frontend must echo back on every mutation. */
export const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Double-submit cookie CSRF guard.
 *
 * How it works:
 *   1. On login the server sets a **non-httpOnly** cookie `luka_csrf` with a
 *      random token. The frontend JS can read this cookie.
 *   2. On every state-changing request (POST/PUT/PATCH/DELETE) the frontend
 *      must echo the cookie value back via the `X-CSRF-Token` header.
 *   3. This guard compares cookie vs header — if they differ the request is
 *      blocked. An attacker site cannot read our cookie (different origin) and
 *      therefore cannot supply the header.
 *
 * Safe methods (GET, HEAD, OPTIONS) are always allowed.
 * Endpoints decorated with @SkipCsrf() are also allowed (e.g. POS webhooks).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const method: string = request.method;

    // Safe methods — no CSRF risk
    if (["GET", "HEAD", "OPTIONS"].includes(method)) {
      return true;
    }

    // Check @SkipCsrf() decorator
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const cookieToken = request.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = request.headers?.[CSRF_HEADER_NAME];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException("CSRF token inválido");
    }

    return true;
  }
}
