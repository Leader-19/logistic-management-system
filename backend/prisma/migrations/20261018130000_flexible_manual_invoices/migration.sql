ALTER TABLE "invoices"
  ADD COLUMN "customer_id" UUID,
  ADD COLUMN "due_at" TIMESTAMP(3),
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "header_note" TEXT,
  ADD COLUMN "payment_terms" TEXT,
  ADD COLUMN "footer_note" TEXT;

UPDATE "invoices" AS invoice
SET "customer_id" = shipment."customer_id"
FROM "shipments" AS shipment
WHERE shipment."tenant_id" = invoice."tenant_id"
  AND shipment."id" = invoice."shipment_id";

ALTER TABLE "invoices"
  ALTER COLUMN "customer_id" SET NOT NULL,
  ALTER COLUMN "shipment_id" DROP NOT NULL;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_tenant_id_customer_id_fkey"
  FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "invoices_tenant_id_customer_id_issued_at_idx"
  ON "invoices"("tenant_id", "customer_id", "issued_at");
