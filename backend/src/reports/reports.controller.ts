import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard, PermissionGuard, RequirePermissions, TenantGuard } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { ReportsService } from "./reports.service";

@ApiTags("reports")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("reports")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("summary")
  @RequirePermissions("reports.read")
  @ApiOperation({ summary: "Get current tenant shipment, billing, and stock summary" })
  summary(@Req() req: AuthenticatedRequest) { return this.reports.summary(req.tenantId); }
}
