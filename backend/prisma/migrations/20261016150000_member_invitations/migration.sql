ALTER TABLE "tenant_memberships"
  ADD COLUMN "invitation_token_hash" TEXT,
  ADD COLUMN "invitation_expires_at" TIMESTAMP(3),
  ADD COLUMN "invitation_requires_password" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "tenant_memberships_invitation_token_hash_key"
  ON "tenant_memberships"("invitation_token_hash");
