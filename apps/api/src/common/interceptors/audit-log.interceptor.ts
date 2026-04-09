import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, tap } from "rxjs";
import { AuditService } from "../../modules/audit/audit.service";
import { JwtPayload } from "../decorators/current-user.decorator";
import { SKIP_AUDIT_KEY } from "../decorators/skip-audit.decorator";

/** Routes that should never be audited */
const SKIP_PATHS = ["/auth/login", "/auth/refresh", "/auth/register", "/health"];

/** Map HTTP method to action string */
const ACTION_MAP: Record<string, string> = {
  POST: "CREATE",
  PUT: "UPDATE",
  PATCH: "UPDATE",
  DELETE: "DELETE",
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private auditService: AuditService,
    private reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method: string = request.method;

    // Only audit mutations
    if (["GET", "HEAD", "OPTIONS"].includes(method)) {
      return next.handle();
    }

    // Check @SkipAudit() decorator
    const skipAudit = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipAudit) {
      return next.handle();
    }

    // Skip auth and health endpoints
    const url: string = request.url || request.path || "";
    const cleanPath = url.split("?")[0].replace(/^\/api/, "");
    if (SKIP_PATHS.some((sp) => cleanPath.startsWith(sp))) {
      return next.handle();
    }

    // Extract module from first path segment: /inventarios/products → INVENTARIOS
    const segments = cleanPath.split("/").filter(Boolean);
    const module = segments.length > 0 ? segments[0].toUpperCase() : "UNKNOWN";
    const entityType = segments.length > 1 ? segments[1] : undefined;
    const entityId = request.params?.id || (segments.length > 2 ? segments[2] : undefined);
    const action = ACTION_MAP[method] || method;

    const user = request.user as JwtPayload | undefined;

    return next.handle().pipe(
      tap({
        next: () => {
          try {
            const userName = user
              ? [user.email].filter(Boolean).join(" ")
              : undefined;

            this.auditService.log({
              organizationId: user?.organizationId || "unknown",
              userId: user?.sub || undefined,
              userName,
              action,
              module,
              entityType,
              entityId: entityId ? String(entityId) : undefined,
              description: `${action} ${module}${entityType ? "/" + entityType : ""}${entityId ? " #" + entityId : ""}`,
              ipAddress:
                request.ip ||
                request.headers?.["x-forwarded-for"] ||
                undefined,
              userAgent: request.headers?.["user-agent"] || undefined,
            });
          } catch {
            // Audit logging must never break the response
          }
        },
        error: () => {
          // Don't log failed requests
        },
      }),
    );
  }
}
