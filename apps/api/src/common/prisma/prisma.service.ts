import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@luka/database";

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

/** Shared mutable ref so the $extends closure can read the current tenant ID. */
const tenantCtx: { orgId?: string } = { orgId: undefined };

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });

    // Prisma v6 removed $use() middleware. Use $extends with the query
    // component instead. $extends returns a new client instance, so we wrap
    // access via Proxy so that model delegates transparently use the extended
    // client while PrismaService's own API (setTenantOrgId, lifecycle hooks)
    // stays on the original instance.
    const extended = (this as PrismaClient).$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }: any) {
            if (
              model &&
              ORG_SCOPED_MODELS.has(model) &&
              operation &&
              FILTERED_OPERATIONS.has(operation)
            ) {
              const tenantId = tenantCtx.orgId;
              if (tenantId) {
                args.where = args.where || {};
                if (!args.where.organizationId) {
                  args.where.organizationId = tenantId;
                }
              }
            }
            return query(args);
          },
        },
      },
    });

    return new Proxy(this, {
      get(target: any, prop: string | symbol, receiver: any) {
        // PrismaService's own prototype methods (setTenantOrgId, lifecycle, etc.)
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

  /** Set the tenant organization ID for all subsequent queries in this request. */
  setTenantOrgId(orgId: string) {
    tenantCtx.orgId = orgId;
  }

  /** Clear the tenant context (e.g. for system-level operations). */
  clearTenantOrgId() {
    tenantCtx.orgId = undefined;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
