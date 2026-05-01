-- Sprint 10: controlled review ledger for operational reconciliation issues.
CREATE TYPE "OperationalReconciliationReviewStatus" AS ENUM ('OPEN', 'REVIEWED', 'RESOLVED', 'IGNORED');

CREATE TABLE "operational_reconciliation_reviews" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "issue_fingerprint" TEXT NOT NULL,
    "issue_area" TEXT NOT NULL,
    "issue_type" TEXT,
    "issue_status" TEXT NOT NULL,
    "branch_id" TEXT,
    "branch_name" TEXT,
    "reference_id" TEXT,
    "product_id" TEXT,
    "product_sku" TEXT,
    "review_status" "OperationalReconciliationReviewStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_by_name" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "ignored_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_reconciliation_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operational_reconciliation_reviews_organization_id_issue_fingerprint_key"
ON "operational_reconciliation_reviews"("organization_id", "issue_fingerprint");

CREATE INDEX "operational_reconciliation_reviews_organization_id_review_status_idx"
ON "operational_reconciliation_reviews"("organization_id", "review_status");

CREATE INDEX "operational_reconciliation_reviews_organization_id_issue_area_idx"
ON "operational_reconciliation_reviews"("organization_id", "issue_area");

CREATE INDEX "operational_reconciliation_reviews_organization_id_branch_id_idx"
ON "operational_reconciliation_reviews"("organization_id", "branch_id");

ALTER TABLE "operational_reconciliation_reviews"
ADD CONSTRAINT "operational_reconciliation_reviews_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
