import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ShipmentsModule } from "../shipments/shipments.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({
  imports: [AuthModule, ShipmentsModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
