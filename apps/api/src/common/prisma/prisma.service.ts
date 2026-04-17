import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@luka/database";
import { TenantContextService } from "../tenant/tenant-context.service";
import { TenantContextStore } from "../tenant/tenant-context.service";

/**
 * Models that have an organizationId column and should be automatically
 * scoped to the current user's organization on read queries.
 *
 * This list MUST be kept in sync with the Prisma schema.
 * Models without organizationId (e.g. UserBranchRole, InterBranchTransferItem,
 * PurchaseOrderItem, etc.) are child records reached via relation and don't
 * need direct filtering.
 */
const ORG_SCOPED_MODELS = new Set([
  "legalEntity",
  "branch",
  "user",
  "role",
  "auditLog",
  "productCategory",
  "product",
  "recipe",
  "supplier",
  "purchaseOrder",
  "bankAccount",
  "accountPayable",
  "accountReceivable",
  "payment",
  "employee",
  "payrollPeriod",
  "isrTable",
  "imssRate",
  "suaExport",
  "cFDI",
  "accountCatalog",
  "journalEntry",
  "fiscalPeriod",
  "taxDeclaration",
  "customer",
  "loyaltyTransaction",
  "loyaltyProgram",
  "loyaltyReward",
  "promotion",
  "posSale",
  "posSyncLog",
  "wasteLog",
  "deliveryOrder",
  "deliveryConfig",
  "requisition",
  "physicalCount",
  "productLot",
  "whatsAppConfig",
  "alertRule",
  "shiftTemplate",
  "shiftAssignment",
  "attendanceRecord",
  "workyConfig",
  "workySyncLog",
  "branchBudget",
  "dataImport",
  "notification",
]);

/**
 * Prisma operations where we should inject the organizationId filter.
 * We only filter reads — writes already require explicit organizationId.
 */
const FILTERED_OPERATIONS = new Set([
  "findFirst",
  "findMany",
  "findUnique",
  "count",
  "aggregate",
  "groupBy",
]);

export class MissingTenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Missing tenant context for ${model}.${operation}. Authenticated requests must provide organizationId implicitly or explicitly.`,
    );
    this.name = "MissingTenantContextError";
  }
}

function hasExplicitOrganizationId(args: Record<string, unknown> | undefined) {
  if (!args?.where || typeof args.where !== "object") {
    return false;
  }

  return Boolean((args.where as Record<string, unknown>).organizationId);
}

export function applyTenantScopeToArgs(
  model: string | undefined,
  operation: string | undefined,
  args: Record<string, unknown> | undefined,
  tenantContext: TenantContextStore | undefined,
) {
  if (!model || !operation) {
    return args;
  }

  if (!ORG_SCOPED_MODELS.has(model) || !FILTERED_OPERATIONS.has(operation)) {
    return args;
  }

  if (hasExplicitOrganizationId(args)) {
    return args;
  }

  const tenantId = tenantContext?.organizationId;
  if (!tenantId) {
    if (tenantContext?.requireTenant) {
      throw new MissingTenantContextError(model, operation);
    }
    return args;
  }

  const nextArgs = { ...(args ?? {}) };
  const where =
    nextArgs.where && typeof nextArgs.where === "object"
      ? { ...(nextArgs.where as Record<string, unknown>) }
      : {};

  nextArgs.where = {
    ...where,
    organizationId: tenantId,
  };
  return nextArgs;
}

export function createTenantQueryExtension(getTenantContext: () => TenantContextStore | undefined) {
  return {
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          const scopedArgs = applyTenantScopeToArgs(model, operation, args, getTenantContext());
          return query(scopedArgs);
        },
      },
    },
  };
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly tenantContext: TenantContextService) {
    super({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });

    // Prisma v6 removed $use() middleware. Use $extends with the query
    // component instead. $extends returns a new client instance, so we wrap
    // access via Proxy so that model delegates transparently use the extended
    // client while PrismaService's own API (lifecycle hooks, etc.) stays on
    // the original instance.
    const extended = (this as PrismaClient).$extends(
      createTenantQueryExtension(() => this.tenantContext.getStore()),
    );

    return new Proxy(this, {
      get(target: any, prop: string | symbol, receiver: any) {
        // PrismaService's own prototype methods (lifecycle, etc.)
        // take priority — but NOT PrismaClient's own properties like model
        // delegates, which must go through the extended client for tenant filtering.
        if (Object.prototype.hasOwnProperty.call(PrismaService.prototype, prop)) {
          return Reflect.get(target, prop, receiver);
        }
        // Everything else — model delegates, $connect, $transaction, etc. —
        // goes through the extended client so the query extension applies.
        const value = (extended as any)[prop];
        return typeof value === "function" ? value.bind(extended) : value;
      },
    }) as this;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
