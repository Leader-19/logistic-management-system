import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "./common/prisma.service";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { TenantsModule } from "./tenants/tenants.module";
import { BranchesModule } from "./branches/branches.module";
import { RolesModule } from "./roles/roles.module";
import { PermissionsModule } from "./permissions/permissions.module";
import { MembersModule } from "./members/members.module";
import { CustomersModule } from "./customers/customers.module";
import { ShipmentsModule } from "./shipments/shipments.module";
import { AuditModule } from "./audit/audit.module";
import { PlatformModule } from "./platform/platform.module";
import { BillingModule } from "./billing/billing.module";
import { ProductsModule } from "./products/products.module";
import { WarehouseModule } from "./warehouse/warehouse.module";
import { FleetModule } from "./fleet/fleet.module";
import { ReportsModule } from "./reports/reports.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PackagingModule } from "./packaging/packaging.module";
import { SupplyChainModule } from "./supply-chain/supply-chain.module";
import { IdempotencyInterceptor } from "./common/idempotency.interceptor";

@Module({
  imports: [
    PrismaModule,       // Global — provides PrismaService everywhere
    AuthModule,         // Auth (register, login, profile)
    HealthModule,       // Health check
    TenantsModule,      // Tenant profile & settings
    BranchesModule,     // Branch CRUD
    RolesModule,        // Role CRUD & permission assignment
    PermissionsModule,  // Permission listing
    MembersModule,      // Member invite, role assignment, deactivation
    CustomersModule,    // Customer CRUD
    ShipmentsModule,    // Shipment CRUD, events, public tracking
    BillingModule,      // Immutable shipment invoices
    ProductsModule,     // Tenant product catalog and barcode lookups
    WarehouseModule,    // Tenant warehouse stock and movement history
    FleetModule,        // Tenant fleet records
    ReportsModule,      // Tenant summary reporting
    NotificationsModule,
    PackagingModule,
    SupplyChainModule,
    AuditModule,        // Audit log viewer
    PlatformModule,     // Platform administration and audited tenant support sessions
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
})
export class AppModule {}

