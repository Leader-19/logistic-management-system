import { Injectable } from "@nestjs/common";
import { ShipmentsService } from "../shipments/shipments.service";
import { BillingService } from "../billing/billing.service";
import { WarehouseService } from "../warehouse/warehouse.service";

@Injectable()
export class ReportsService {
  constructor(private readonly shipments: ShipmentsService, private readonly billing: BillingService, private readonly warehouse: WarehouseService) {}

  async summary(tenantId: string) {
    const [shipments, invoices, inventory] = await Promise.all([
      this.shipments.summary(tenantId),
      this.billing.summary(tenantId),
      this.warehouse.summary(tenantId),
    ]);
    return { shipments, invoices, inventory };
  }
}
