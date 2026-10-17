import { Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard, PermissionGuard, RequirePermissions, TenantGuard } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { PaginationDto } from "../common/dto/pagination.dto";
import { BillingService } from "./billing.service";

@ApiTags("invoices")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("invoices")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @RequirePermissions("invoices.read")
  @ApiOperation({ summary: "List immutable tenant invoices" })
  findAll(@Req() req: AuthenticatedRequest, @Query() pagination: PaginationDto) {
    return this.billing.findAll(req.tenantId, pagination);
  }

  @Get(":id")
  @RequirePermissions("invoices.read")
  @ApiOperation({ summary: "Get invoice details" })
  findOne(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.billing.findOne(req.tenantId, id);
  }

  @Post("from-shipment/:shipmentId")
  @RequirePermissions("invoices.create")
  @ApiOperation({ summary: "Issue an invoice for a delivered shipment" })
  createFromShipment(@Req() req: AuthenticatedRequest, @Param("shipmentId") shipmentId: string) {
    return this.billing.createFromShipment(req.tenantId, shipmentId, req.user.sub);
  }
}
