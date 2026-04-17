import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
import { Observable } from "rxjs";
import { JwtPayload } from "../decorators/current-user.decorator";
import { TenantContextService } from "../tenant/tenant-context.service";

/**
 * Opens a per-request AsyncLocalStorage context so downstream Prisma queries
 * can resolve the correct tenant without relying on shared mutable state.
 *
 * This works with the Prisma query extension in PrismaService to automatically
 * scope all read queries to the current user's organization, preventing
 * cross-tenant data leaks even if a service forgets to filter by orgId.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;
    const organizationId = user?.organizationId;
    const requireTenant = Boolean(user);

    return new Observable((subscriber) => {
      let innerSubscription: { unsubscribe(): void } | undefined;

      this.tenantContext.run({ organizationId, requireTenant }, () => {
        innerSubscription = next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (error) => subscriber.error(error),
          complete: () => subscriber.complete(),
        });
      });

      return () => innerSubscription?.unsubscribe();
    });
  }
}
