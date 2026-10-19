import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard, PermissionGuard, RequirePermissions, TenantGuard } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { PaginationDto } from "../common/dto/pagination.dto";
import { CreateWarehouseDto, StockAdjustmentDto, WarehouseInventoryQueryDto, WarehouseMovementQueryDto } from "./dto/warehouse.dto";
import { WarehouseService } from "./warehouse.service";
@ApiTags("warehouse")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("warehouses")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}
  @Get() @RequirePermissions("warehouse.read")
  list(@Req() req: AuthenticatedRequest, @Query() query: PaginationDto) { return this.warehouse.list(req.tenantId, query); }
  @Post() @RequirePermissions("warehouse.create")
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateWarehouseDto) { return this.warehouse.create(req.tenantId, body); }
  @Get("inventory") @RequirePermissions("warehouse.read") @ApiOperation({ summary: "List warehouse stock balances" })
  inventory(@Req() req: AuthenticatedRequest, @Query() query: WarehouseInventoryQueryDto) { return this.warehouse.inventory(req.tenantId, query); }
  @Get("movements") @RequirePermissions("warehouse.read")
  movements(@Req() req: AuthenticatedRequest, @Query() query: WarehouseMovementQueryDto) { return this.warehouse.movements(req.tenantId, query); }
  @Post(":id/stock") @RequirePermissions("warehouse.stock.adjust") @ApiOperation({ summary: "Append a stock receipt or adjustment" })
  adjust(@Req() req: AuthenticatedRequest, @Param("id") warehouseId: string, @Body() body: StockAdjustmentDto) { return this.warehouse.adjust(req.tenantId, warehouseId, req.user.sub, body); }
}
