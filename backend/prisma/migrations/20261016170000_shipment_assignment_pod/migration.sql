ALTER TABLE "shipments"
  ADD COLUMN "assigned_driver_id" UUID;

CREATE INDEX "shipments_tenant_id_assigned_driver_id_idx"
  ON "shipments"("tenant_id", "assigned_driver_id");

ALTER TABLE "shipments"
  ADD CONSTRAINT "shipments_tenant_id_assigned_driver_id_fkey"
  FOREIGN KEY ("tenant_id", "assigned_driver_id")
  REFERENCES "tenant_memberships"("tenant_id", "user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "proof_of_delivery" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "recipient_name" TEXT NOT NULL,
  "note" TEXT,
  "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actor_id" UUID,
  CONSTRAINT "proof_of_delivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "proof_of_delivery_tenant_id_shipment_id_key"
  ON "proof_of_delivery"("tenant_id", "shipment_id");
CREATE INDEX "proof_of_delivery_tenant_id_delivered_at_idx"
  ON "proof_of_delivery"("tenant_id", "delivered_at");

ALTER TABLE "proof_of_delivery"
  ADD CONSTRAINT "proof_of_delivery_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proof_of_delivery"
  ADD CONSTRAINT "proof_of_delivery_tenant_id_shipment_id_fkey"
  FOREIGN KEY ("tenant_id", "shipment_id") REFERENCES "shipments"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shipment_events"
  ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

WITH ordered_events AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tenant_id", "shipment_id" ORDER BY "occurred_at", "id") AS event_sequence
  FROM "shipment_events"
)
UPDATE "shipment_events" AS event
SET "sequence" = ordered_events.event_sequence
FROM ordered_events
WHERE event."id" = ordered_events."id";

CREATE UNIQUE INDEX "shipment_events_tenant_id_shipment_id_sequence_key"
  ON "shipment_events"("tenant_id", "shipment_id", "sequence");
