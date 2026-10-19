ALTER TABLE "invoices" ADD COLUMN "template_snapshot" JSONB;

CREATE TABLE "invoice_templates" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "default_slot" TEXT,
  "current_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoice_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "invoice_templates_tenant_id_id_key" ON "invoice_templates"("tenant_id", "id");
CREATE UNIQUE INDEX "invoice_templates_tenant_id_name_key" ON "invoice_templates"("tenant_id", "name");
CREATE INDEX "invoice_templates_tenant_id_default_slot_idx" ON "invoice_templates"("tenant_id", "default_slot");
CREATE UNIQUE INDEX "invoice_templates_tenant_id_default_slot_key" ON "invoice_templates"("tenant_id", "default_slot");

CREATE TABLE "invoice_template_versions" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "layout" JSONB NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_template_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_template_versions_tenant_template_fkey" FOREIGN KEY ("tenant_id", "template_id") REFERENCES "invoice_templates"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "invoice_template_versions_tenant_id_id_key" ON "invoice_template_versions"("tenant_id", "id");
CREATE UNIQUE INDEX "invoice_template_versions_tenant_id_template_id_version_key" ON "invoice_template_versions"("tenant_id", "template_id", "version");
CREATE INDEX "invoice_template_versions_tenant_id_template_id_created_at_idx" ON "invoice_template_versions"("tenant_id", "template_id", "created_at");
