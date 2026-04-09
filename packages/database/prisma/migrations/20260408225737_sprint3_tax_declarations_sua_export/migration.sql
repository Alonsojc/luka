-- CreateTable
CREATE TABLE "sua_exports" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "file_content" TEXT NOT NULL,
    "movement_count" INTEGER NOT NULL DEFAULT 0,
    "total_employer" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_employee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "generated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sua_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_declarations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(14,2) NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "filed_at" TIMESTAMP(3),
    "filing_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sua_exports_organization_id_year_month_idx" ON "sua_exports"("organization_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "tax_declarations_organization_id_year_month_type_key" ON "tax_declarations"("organization_id", "year", "month", "type");

-- AddForeignKey
ALTER TABLE "sua_exports" ADD CONSTRAINT "sua_exports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_declarations" ADD CONSTRAINT "tax_declarations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
