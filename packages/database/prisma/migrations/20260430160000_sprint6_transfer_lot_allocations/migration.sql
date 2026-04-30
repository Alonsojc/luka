CREATE TABLE "inter_branch_transfer_lot_allocations" (
    "id" TEXT NOT NULL,
    "transfer_item_id" TEXT NOT NULL,
    "source_lot_id" TEXT,
    "lot_number" TEXT NOT NULL,
    "expiration_date" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "received_quantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(12,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inter_branch_transfer_lot_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inter_branch_transfer_lot_allocations_transfer_item_id_idx" ON "inter_branch_transfer_lot_allocations"("transfer_item_id");
CREATE INDEX "inter_branch_transfer_lot_allocations_source_lot_id_idx" ON "inter_branch_transfer_lot_allocations"("source_lot_id");

ALTER TABLE "inter_branch_transfer_lot_allocations"
ADD CONSTRAINT "inter_branch_transfer_lot_allocations_transfer_item_id_fkey"
FOREIGN KEY ("transfer_item_id") REFERENCES "inter_branch_transfer_items"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inter_branch_transfer_lot_allocations"
ADD CONSTRAINT "inter_branch_transfer_lot_allocations_source_lot_id_fkey"
FOREIGN KEY ("source_lot_id") REFERENCES "product_lots"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
