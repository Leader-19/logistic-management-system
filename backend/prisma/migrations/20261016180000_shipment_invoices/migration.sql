CREATE TABLE "invoices" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "invoice_number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ISSUED',
  "subtotal" DECIMAL(18,4) NOT NULL,
  "tax_rate" DECIMAL(7,4) NOT NULL,
  "tax_amount" DECIMAL(18,4) NOT NULL,
  "total" DECIMAL(18,4) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoices_nonnegative_amounts_check" CHECK ("subtotal" >= 0 AND "tax_amount" >= 0 AND "total" >= 0),
  CONSTRAINT "invoices_tax_rate_check" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100)
);

CREATE TABLE "invoice_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(12,4) NOT NULL DEFAULT 1,
  "unit_price" DECIMAL(18,4) NOT NULL,
  "line_total" DECIMAL(18,4) NOT NULL,
  CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_lines_amounts_check" CHECK ("quantity" > 0 AND "unit_price" >= 0 AND "line_total" >= 0)
);

CREATE UNIQUE INDEX "invoices_tenant_id_id_key" ON "invoices"("tenant_id", "id");
CREATE UNIQUE INDEX "invoices_tenant_id_shipment_id_key" ON "invoices"("tenant_id", "shipment_id");
CREATE UNIQUE INDEX "invoices_tenant_id_invoice_number_key" ON "invoices"("tenant_id", "invoice_number");
CREATE INDEX "invoices_tenant_id_issued_at_idx" ON "invoices"("tenant_id", "issued_at");
CREATE INDEX "invoice_lines_tenant_id_invoice_id_idx" ON "invoice_lines"("tenant_id", "invoice_id");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_tenant_id_shipment_id_fkey" FOREIGN KEY ("tenant_id", "shipment_id") REFERENCES "shipments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_lines"
  ADD CONSTRAINT "invoice_lines_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
