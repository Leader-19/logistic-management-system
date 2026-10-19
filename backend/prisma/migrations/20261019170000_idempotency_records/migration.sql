CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "scope_key" VARCHAR(80) NOT NULL,
    "actor_id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "response_body" JSONB,
    "response_status" INTEGER,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_records_scope_key_actor_id_key_key" ON "idempotency_records"("scope_key", "actor_id", "key");
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
