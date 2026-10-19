import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard, PermissionGuard, RequirePermissions, TenantGuard } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { CreatePurchaseOrderDto, PurchaseOrderListQueryDto, ReceivePurchaseOrderDto, SupplierDto, SupplyChainListQueryDto } from "./dto/supply-chain.dto";
import { SupplyChainService } from "./supply-chain.service";

@ApiTags("supply chain")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("supply-chain")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class SupplyChainController {
  constructor(private readonly service: SupplyChainService) { }

  @Get("suppliers")
  @RequirePermissions("suppliers.read")
  @ApiOperation({ summary: "List tenant suppliers" })
  suppliers(@Req() req: AuthenticatedRequest, @Query() query: SupplyChainListQueryDto) {
    return this.service.listSuppliers(req.tenantId, query, query.search);
  }

  @Post("suppliers")
  @RequirePermissions("suppliers.create")
  createSupplier(@Req() req: AuthenticatedRequest, @Body() body: SupplierDto) {
    return this.service.createSupplier(req.tenantId, req.user.sub, body);
  }

  @Get("purchase-orders")
  @RequirePermissions("purchasing.read")
  @ApiOperation({ summary: "List purchase orders with supplier, line, and receiving status" })
  purchaseOrders(@Req() req: AuthenticatedRequest, @Query() query: PurchaseOrderListQueryDto) {
    return this.service.listPurchaseOrders(req.tenantId, query);
  }

  @Post("purchase-orders")
  @RequirePermissions("purchasing.create")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  createPurchaseOrder(@Req() req: AuthenticatedRequest, @Body() body: CreatePurchaseOrderDto) {
    return this.service.createPurchaseOrder(req.tenantId, req.user.sub, body);
  }

  @Post("purchase-orders/:id/issue")
  @RequirePermissions("purchasing.update")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  issuePurchaseOrder(@Req() req: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.service.issuePurchaseOrder(req.tenantId, req.user.sub, id);
  }

  @Post("purchase-orders/:id/receive")
  @RequirePermissions("purchasing.update")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  receivePurchaseOrder(@Req() req: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string, @Body() body: ReceivePurchaseOrderDto) {
    return this.service.receivePurchaseOrder(req.tenantId, req.user.sub, id, body);
  }
}
