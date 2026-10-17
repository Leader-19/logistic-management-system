import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { ShipmentsModule } from "../shipments/shipments.module";
import { WarehouseModule } from "../warehouse/warehouse.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({ imports: [AuthModule, BillingModule, ShipmentsModule, WarehouseModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
