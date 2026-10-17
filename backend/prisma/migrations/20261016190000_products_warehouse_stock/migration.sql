CREATE TABLE "product_categories" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "products" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "category_id" UUID,
  "sku" TEXT NOT NULL,
  "barcode" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "warehouses" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "inventory_balances" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_balances_nonnegative_check" CHECK ("quantity" >= 0)
);
CREATE TABLE "stock_movements" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity_change" DECIMAL(14,3) NOT NULL,
  "quantity_after" DECIMAL(14,3) NOT NULL,
  "reason" TEXT NOT NULL,
  "actor_id" UUID NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_movements_quantity_check" CHECK ("quantity_change" <> 0 AND "quantity_after" >= 0)
);

CREATE UNIQUE INDEX "product_categories_tenant_id_id_key" ON "product_categories"("tenant_id", "id");
CREATE UNIQUE INDEX "product_categories_tenant_id_name_key" ON "product_categories"("tenant_id", "name");
CREATE UNIQUE INDEX "products_tenant_id_id_key" ON "products"("tenant_id", "id");
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");
CREATE UNIQUE INDEX "products_tenant_id_barcode_key" ON "products"("tenant_id", "barcode");
CREATE INDEX "products_tenant_id_name_idx" ON "products"("tenant_id", "name");
CREATE UNIQUE INDEX "warehouses_tenant_id_id_key" ON "warehouses"("tenant_id", "id");
CREATE UNIQUE INDEX "warehouses_tenant_id_name_key" ON "warehouses"("tenant_id", "name");
CREATE UNIQUE INDEX "inventory_balances_tenant_id_warehouse_id_product_id_key" ON "inventory_balances"("tenant_id", "warehouse_id", "product_id");
CREATE INDEX "inventory_balances_tenant_id_product_id_idx" ON "inventory_balances"("tenant_id", "product_id");
CREATE INDEX "stock_movements_tenant_id_warehouse_id_recorded_at_idx" ON "stock_movements"("tenant_id", "warehouse_id", "recorded_at");
CREATE INDEX "stock_movements_tenant_id_product_id_recorded_at_idx" ON "stock_movements"("tenant_id", "product_id", "recorded_at");

ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "product_categories"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_tenant_id_warehouse_id_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_warehouse_id_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
