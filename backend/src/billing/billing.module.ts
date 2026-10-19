import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ShipmentsModule } from "../shipments/shipments.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { SaasBillingController, StripeWebhookController } from "./saas-billing.controller";
import { SaasBillingService } from "./saas-billing.service";
import { InvoiceTemplatesService } from "./invoice-templates.service";

@Module({
  imports: [AuthModule, ShipmentsModule],
  controllers: [BillingController, SaasBillingController, StripeWebhookController],
  providers: [BillingService, SaasBillingService, InvoiceTemplatesService],
  exports: [BillingService],
})
export class BillingModule {}
