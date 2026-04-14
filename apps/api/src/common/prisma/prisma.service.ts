import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Scope,
} from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Inject } from "@nestjs/common";
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

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log:
        process.env.NODE_ENV === "development"
          ? ["error", "warn"]
          : ["error"],
    });

    // Prisma middleware that automatically injects organizationId on read queries.
    // This is a safety net — services should still pass organizationId explicitly,
    // but if they forget, this middleware prevents cross-tenant data leaks.
    this.$use(async (params, next) => {
      const model = params.model;
      const action = params.action;

      if (
        model &&
        ORG_SCOPED_MODELS.has(model) &&
        action &&
        FILTERED_OPERATIONS.has(action)
      ) {
        // The organizationId is injected via request context by the
        // TenantInterceptor. If present, merge it into the where clause.
        const tenantId = (this as any).__tenantOrgId;
        if (tenantId) {
          if (action === "groupBy") {
            // groupBy uses a top-level `where`
            params.args = params.args || {};
            params.args.where = params.args.where || {};
            if (!params.args.where.organizationId) {
              params.args.where.organizationId = tenantId;
            }
          } else if (action === "aggregate") {
            params.args = params.args || {};
            params.args.where = params.args.where || {};
            if (!params.args.where.organizationId) {
              params.args.where.organizationId = tenantId;
            }
          } else {
            // findFirst, findMany, findUnique, count
            params.args = params.args || {};
            params.args.where = params.args.where || {};
            if (!params.args.where.organizationId) {
              params.args.where.organizationId = tenantId;
            }
          }
        }
      }

      return next(params);
    });
  }

  /** Set the tenant organization ID for all subsequent queries in this request. */
  setTenantOrgId(orgId: string) {
    (this as any).__tenantOrgId = orgId;
  }

  /** Clear the tenant context (e.g. for system-level operations). */
  clearTenantOrgId() {
    (this as any).__tenantOrgId = undefined;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
