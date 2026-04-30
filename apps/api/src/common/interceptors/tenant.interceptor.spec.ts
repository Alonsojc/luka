import { CallHandler, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, Observable } from "rxjs";
import { describe, expect, it } from "vitest";
import { JwtPayload } from "../decorators/current-user.decorator";
import { TenantContextService } from "../tenant/tenant-context.service";
import { TenantInterceptor } from "./tenant.interceptor";

describe("TenantInterceptor", () => {
  const createContext = (user?: Partial<JwtPayload>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as ExecutionContext;

  const createHandler = (tenantContext: TenantContextService, delayMs: number): CallHandler => ({
    handle: () =>
      new Observable<string>((subscriber) => {
        setTimeout(() => {
          subscriber.next(
            `${tenantContext.getOrganizationId() ?? "missing"}:${
              tenantContext.isTenantRequired() ? "required" : "optional"
            }`,
          );
          subscriber.complete();
        }, delayMs);
      }),
  });

  it("runs the request pipeline inside the tenant context", async () => {
    const tenantContext = new TenantContextService();
    const interceptor = new TenantInterceptor(tenantContext);

    const result = await lastValueFrom(
      interceptor.intercept(
        createContext({
          sub: "user-1",
          email: "test@luka.mx",
          organizationId: "org-1",
          roles: [],
        }),
        createHandler(tenantContext, 0),
      ),
    );

    expect(result).toBe("org-1:required");
  });

  it("keeps concurrent requests isolated", async () => {
    const tenantContext = new TenantContextService();
    const interceptor = new TenantInterceptor(tenantContext);

    const runRequest = (organizationId: string, delayMs: number) =>
      lastValueFrom(
        interceptor.intercept(
          createContext({
            sub: `user-${organizationId}`,
            email: `${organizationId}@luka.mx`,
            organizationId,
            roles: [],
          }),
          createHandler(tenantContext, delayMs),
        ),
      );

    const [first, second] = await Promise.all([runRequest("org-1", 25), runRequest("org-2", 5)]);

    expect(first).toBe("org-1:required");
    expect(second).toBe("org-2:required");
  });

  it("marks unauthenticated requests as tenant-optional", async () => {
    const tenantContext = new TenantContextService();
    const interceptor = new TenantInterceptor(tenantContext);

    const result = await lastValueFrom(
      interceptor.intercept(createContext(), createHandler(tenantContext, 0)),
    );

    expect(result).toBe("missing:optional");
  });

  it("marks authenticated requests without organizationId as tenant-required", async () => {
    const tenantContext = new TenantContextService();
    const interceptor = new TenantInterceptor(tenantContext);

    const result = await lastValueFrom(
      interceptor.intercept(
        createContext({
          sub: "user-1",
          email: "test@luka.mx",
          roles: [],
        }),
        createHandler(tenantContext, 0),
      ),
    );

    expect(result).toBe("missing:required");
  });
});
