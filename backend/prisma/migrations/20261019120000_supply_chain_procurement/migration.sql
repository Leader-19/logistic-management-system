CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

CREATE TABLE "suppliers" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "suppliers_tenant_id_id_key" ON "suppliers"("tenant_id", "id");
CREATE UNIQUE INDEX "suppliers_tenant_id_name_key" ON "suppliers"("tenant_id", "name");
CREATE INDEX "suppliers_tenant_id_is_active_name_idx" ON "suppliers"("tenant_id", "is_active", "name");

CREATE TABLE "purchase_orders" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "order_number" TEXT NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" CHAR(3) NOT NULL,
  "notes" TEXT,
  "expected_at" TIMESTAMP(3),
  "ordered_at" TIMESTAMP(3),
  "received_at" TIMESTAMP(3),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_orders_tenant_supplier_fkey" FOREIGN KEY ("tenant_id", "supplier_id") REFERENCES "suppliers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_orders_tenant_warehouse_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "purchase_orders_tenant_id_id_key" ON "purchase_orders"("tenant_id", "id");
CREATE UNIQUE INDEX "purchase_orders_tenant_id_order_number_key" ON "purchase_orders"("tenant_id", "order_number");
CREATE INDEX "purchase_orders_tenant_id_status_created_at_idx" ON "purchase_orders"("tenant_id", "status", "created_at");
CREATE INDEX "purchase_orders_tenant_id_supplier_id_created_at_idx" ON "purchase_orders"("tenant_id", "supplier_id", "created_at");

CREATE TABLE "purchase_order_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "received_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "unit_cost" DECIMAL(18,4) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_order_lines_purchase_order_fkey" FOREIGN KEY ("tenant_id", "purchase_order_id") REFERENCES "purchase_orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_order_lines_product_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_order_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "purchase_order_lines_received_check" CHECK ("received_quantity" >= 0 AND "received_quantity" <= "quantity"),
  CONSTRAINT "purchase_order_lines_cost_check" CHECK ("unit_cost" >= 0)
);
CREATE UNIQUE INDEX "purchase_order_lines_tenant_id_id_key" ON "purchase_order_lines"("tenant_id", "id");
CREATE UNIQUE INDEX "purchase_order_lines_tenant_id_purchase_order_id_product_id_key" ON "purchase_order_lines"("tenant_id", "purchase_order_id", "product_id");
CREATE INDEX "purchase_order_lines_tenant_id_product_id_idx" ON "purchase_order_lines"("tenant_id", "product_id");

CREATE TABLE "purchase_receipts" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "receipt_number" TEXT NOT NULL,
  "received_by" UUID NOT NULL,
  "notes" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_receipts_purchase_order_fkey" FOREIGN KEY ("tenant_id", "purchase_order_id") REFERENCES "purchase_orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_receipts_warehouse_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "purchase_receipts_tenant_id_id_key" ON "purchase_receipts"("tenant_id", "id");
CREATE UNIQUE INDEX "purchase_receipts_tenant_id_receipt_number_key" ON "purchase_receipts"("tenant_id", "receipt_number");
CREATE INDEX "purchase_receipts_tenant_id_purchase_order_id_received_at_idx" ON "purchase_receipts"("tenant_id", "purchase_order_id", "received_at");

CREATE TABLE "purchase_receipt_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "receipt_id" UUID NOT NULL,
  "purchase_order_line_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  CONSTRAINT "purchase_receipt_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_receipt_lines_receipt_fkey" FOREIGN KEY ("tenant_id", "receipt_id") REFERENCES "purchase_receipts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_receipt_lines_order_line_fkey" FOREIGN KEY ("tenant_id", "purchase_order_line_id") REFERENCES "purchase_order_lines"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_receipt_lines_product_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_receipt_lines_quantity_check" CHECK ("quantity" > 0)
);
CREATE UNIQUE INDEX "purchase_receipt_lines_tenant_id_id_key" ON "purchase_receipt_lines"("tenant_id", "id");
CREATE INDEX "purchase_receipt_lines_tenant_id_purchase_order_line_id_idx" ON "purchase_receipt_lines"("tenant_id", "purchase_order_line_id");
