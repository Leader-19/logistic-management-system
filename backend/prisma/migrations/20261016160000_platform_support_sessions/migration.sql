CREATE TABLE "platform_support_sessions" (
  "id" UUID NOT NULL,
  "admin_user_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "permission_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "ended_at" TIMESTAMP(3),
  CONSTRAINT "platform_support_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_support_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_support_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "platform_support_sessions_admin_user_id_expires_at_idx"
  ON "platform_support_sessions"("admin_user_id", "expires_at");
CREATE INDEX "platform_support_sessions_tenant_id_expires_at_idx"
  ON "platform_support_sessions"("tenant_id", "expires_at");
