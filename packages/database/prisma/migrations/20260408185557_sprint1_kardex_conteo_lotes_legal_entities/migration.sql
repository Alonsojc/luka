-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "legal_entity_id" TEXT;

-- CreateTable
CREATE TABLE "legal_entities" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rfc" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "regimen_fiscal" TEXT NOT NULL,
    "csd_certificate" BYTEA,
    "csd_key" BYTEA,
    "csd_password" TEXT,
    "address" TEXT,
    "postal_code" TEXT,
    "logo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_counts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "count_date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "started_by_id" TEXT NOT NULL,
    "completed_by_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "total_products" INTEGER NOT NULL DEFAULT 0,
    "total_discrepancies" INTEGER NOT NULL DEFAULT 0,
    "total_adjustment_value" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "physical_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_count_items" (
    "id" TEXT NOT NULL,
    "physical_count_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "system_quantity" DECIMAL(12,4) NOT NULL,
    "counted_quantity" DECIMAL(12,4),
    "difference" DECIMAL(12,4),
    "unit_cost" DECIMAL(12,4),
    "adjustment_value" DECIMAL(14,2),
    "notes" TEXT,
    "counted_at" TIMESTAMP(3),

    CONSTRAINT "physical_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_lots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "lot_number" TEXT NOT NULL,
    "batch_date" TIMESTAMP(3),
    "expiration_date" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "initial_quantity" DECIMAL(12,4) NOT NULL,
    "unit_cost" DECIMAL(12,4),
    "supplier_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "received_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_lots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_entities_organization_id_rfc_key" ON "legal_entities"("organization_id", "rfc");

-- CreateIndex
CREATE INDEX "physical_counts_organization_id_branch_id_idx" ON "physical_counts"("organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "physical_count_items_physical_count_id_product_id_key" ON "physical_count_items"("physical_count_id", "product_id");

-- CreateIndex
CREATE INDEX "product_lots_organization_id_expiration_date_idx" ON "product_lots"("organization_id", "expiration_date");

-- CreateIndex
CREATE INDEX "product_lots_branch_id_product_id_idx" ON "product_lots"("branch_id", "product_id");

-- CreateIndex
CREATE INDEX "product_lots_status_idx" ON "product_lots"("status");

-- CreateIndex
CREATE UNIQUE INDEX "product_lots_branch_id_product_id_lot_number_key" ON "product_lots"("branch_id", "product_id", "lot_number");

-- AddForeignKey
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_counts" ADD CONSTRAINT "physical_counts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_counts" ADD CONSTRAINT "physical_counts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_counts" ADD CONSTRAINT "physical_counts_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_counts" ADD CONSTRAINT "physical_counts_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_count_items" ADD CONSTRAINT "physical_count_items_physical_count_id_fkey" FOREIGN KEY ("physical_count_id") REFERENCES "physical_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_count_items" ADD CONSTRAINT "physical_count_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_lots" ADD CONSTRAINT "product_lots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_lots" ADD CONSTRAINT "product_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_lots" ADD CONSTRAINT "product_lots_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_lots" ADD CONSTRAINT "product_lots_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_lots" ADD CONSTRAINT "product_lots_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
