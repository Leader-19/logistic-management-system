CREATE TABLE "package_types" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "length_cm" DECIMAL(8,2) NOT NULL,
  "width_cm" DECIMAL(8,2) NOT NULL,
  "height_cm" DECIMAL(8,2) NOT NULL,
  "tare_weight_grams" INTEGER NOT NULL DEFAULT 0,
  "max_load_grams" INTEGER NOT NULL,
  "stackable" BOOLEAN NOT NULL DEFAULT TRUE,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "package_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "package_types_dimensions_positive_check" CHECK ("length_cm" > 0 AND "width_cm" > 0 AND "height_cm" > 0),
  CONSTRAINT "package_types_weight_check" CHECK ("tare_weight_grams" >= 0 AND "max_load_grams" > 0)
);
CREATE UNIQUE INDEX "package_types_tenant_id_id_key" ON "package_types"("tenant_id", "id");
CREATE UNIQUE INDEX "package_types_tenant_id_code_key" ON "package_types"("tenant_id", "code");
CREATE INDEX "package_types_tenant_id_is_active_name_idx" ON "package_types"("tenant_id", "is_active", "name");
ALTER TABLE "package_types" ADD CONSTRAINT "package_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
