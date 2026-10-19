ALTER TABLE "subscriptions"
  ADD COLUMN "stripe_customer_id" TEXT,
  ADD COLUMN "stripe_subscription_id" TEXT;

CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key"
  ON "subscriptions"("stripe_subscription_id");

CREATE TABLE "billing_webhook_events" (
  "id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_webhook_events_event_id_key"
  ON "billing_webhook_events"("event_id");
