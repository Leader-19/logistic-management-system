import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard, PermissionGuard, RequirePermissions, TenantGuard } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { PaginationDto } from "../common/dto/pagination.dto";
import { BillingService } from "./billing.service";
import { CreateManualInvoiceDto, IssueInvoiceDto } from "./dto/issue-invoice.dto";
import { SaveInvoiceTemplateDto } from "./dto/invoice-template.dto";

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

  @Get("templates")
  @RequirePermissions("invoices.read")
  @ApiOperation({ summary: "List the current tenant invoice templates" })
  listTemplates(@Req() req: AuthenticatedRequest) {
    return this.billing.listTemplates(req.tenantId);
  }

  @Post("templates")
  @RequirePermissions("settings.update")
  @ApiOperation({ summary: "Create a tenant invoice template" })
  createTemplate(@Req() req: AuthenticatedRequest, @Body() body: SaveInvoiceTemplateDto) {
    return this.billing.createTemplate(req.tenantId, req.user.sub, body);
  }

  @Put("templates/:id")
  @RequirePermissions("settings.update")
  @ApiOperation({ summary: "Save a new version of a tenant invoice template" })
  updateTemplate(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: SaveInvoiceTemplateDto) {
    return this.billing.updateTemplate(req.tenantId, req.user.sub, id, body);
  }

  @Post("templates/:id/default")
  @RequirePermissions("settings.update")
  @ApiOperation({ summary: "Set a tenant invoice template as the default" })
  setDefaultTemplate(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.billing.setDefaultTemplate(req.tenantId, req.user.sub, id);
  }
  @Get(":id")
  @RequirePermissions("invoices.read")
  @ApiOperation({ summary: "Get invoice details" })
  findOne(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.billing.findOne(req.tenantId, id);
  }

  @Post()
  @RequirePermissions("invoices.create")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Create and issue a tenant invoice with custom lines and terms" })
  createManual(@Req() req: AuthenticatedRequest, @Body() body: CreateManualInvoiceDto) {
    return this.billing.createManual(req.tenantId, req.user.sub, body);
  }

  @Post("from-shipment/:shipmentId")
  @RequirePermissions("invoices.create")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Issue an invoice for a delivered shipment, optionally with custom line items" })
  createFromShipment(@Req() req: AuthenticatedRequest, @Param("shipmentId") shipmentId: string, @Body() body: IssueInvoiceDto) {
    return this.billing.createFromShipment(req.tenantId, shipmentId, req.user.sub, body);
  }
}
