CREATE TABLE "vehicles" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "registration" TEXT NOT NULL,
  "vehicle_type" TEXT NOT NULL,
  "make" TEXT,
  "model" TEXT,
  "capacity_kg" DECIMAL(12,3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vehicles_capacity_nonnegative_check" CHECK ("capacity_kg" IS NULL OR "capacity_kg" >= 0)
);
CREATE UNIQUE INDEX "vehicles_tenant_id_id_key" ON "vehicles"("tenant_id", "id");
CREATE UNIQUE INDEX "vehicles_tenant_id_registration_key" ON "vehicles"("tenant_id", "registration");
CREATE INDEX "vehicles_tenant_id_status_idx" ON "vehicles"("tenant_id", "status");
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
