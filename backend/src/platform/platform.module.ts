import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "../auth/auth.module";
import { TenantsModule } from "../tenants/tenants.module";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformAuditInterceptor } from "./platform-audit.interceptor";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";

@Module({
  imports: [AuthModule, TenantsModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformAdminGuard, { provide: APP_INTERCEPTOR, useClass: PlatformAuditInterceptor }],
})
export class PlatformModule { }
