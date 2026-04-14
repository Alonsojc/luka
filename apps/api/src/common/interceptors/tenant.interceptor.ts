import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../decorators/current-user.decorator";

/**
 * Sets the tenant organization ID on PrismaService for every authenticated
 * request, and clears it after the response is sent.
 *
 * This works with the Prisma middleware in PrismaService to automatically
 * scope all read queries to the current user's organization, preventing
 * cross-tenant data leaks even if a service forgets to filter by orgId.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    if (user?.organizationId) {
      this.prisma.setTenantOrgId(user.organizationId);
    }

    return next.handle().pipe(
      tap({
        next: () => this.prisma.clearTenantOrgId(),
        error: () => this.prisma.clearTenantOrgId(),
      }),
    );
  }
}
