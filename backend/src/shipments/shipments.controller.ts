import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ShipmentStatus } from "@prisma/client";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { AuthGuard, TenantGuard, PermissionGuard, RequirePermissions } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { PaginationDto } from "../common/dto/pagination.dto";
import { BulkRecordIdsDto } from "../common/dto/bulk-record-ids.dto";
import { ShipmentsService } from "./shipments.service";

class CreateShipmentDto {
  @IsUUID() customerId!: string;
  @IsString() @Length(1, 200) senderName!: string;
  @IsOptional() @IsString() senderPhone?: string;
  @IsOptional() @IsString() senderAddress?: string;
  @IsString() @Length(1, 200) recipientName!: string;
  @IsOptional() @IsString() recipientPhone?: string;
  @IsString() recipientAddress!: string;
  @Type(() => Number) @IsInt() @Min(1) weightGrams!: number;
  @IsOptional() @Type(() => Number) @IsNumber() lengthCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() widthCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() heightCm?: number;
  @IsOptional() @IsString() serviceType?: string;
  @IsOptional() @IsString() notes?: string;
}

class BatchCreateShipmentsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CreateShipmentDto)
  shipments!: CreateShipmentDto[];
}

class UpdateShipmentDto {
  @IsOptional() @IsString() senderName?: string;
  @IsOptional() @IsString() senderPhone?: string;
  @IsOptional() @IsString() senderAddress?: string;
  @IsOptional() @IsString() recipientName?: string;
  @IsOptional() @IsString() recipientPhone?: string;
  @IsOptional() @IsString() recipientAddress?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) weightGrams?: number;
  @IsOptional() @IsString() serviceType?: string;
  @IsOptional() @IsString() notes?: string;
}

class CreateEventDto {
  @IsEnum(ShipmentStatus) status!: ShipmentStatus;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() location?: string;
}

class AssignDriverDto {
  @IsUUID() driverId!: string;
}

class ProofOfDeliveryDto {
  @IsString() @Length(2, 120) recipientName!: string;
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
}

@ApiTags("shipments")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("shipments")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class ShipmentsController {
  constructor(private readonly service: ShipmentsService) {}

  @Get("drivers")
  @RequirePermissions("shipments.assign")
  @ApiOperation({ summary: "List active drivers in the current tenant" })
  listDrivers(@Req() req: AuthenticatedRequest) {
    return this.service.listDrivers(req.tenantId);
  }

  @Get("mine")
  @RequirePermissions("shipments.read")
  @ApiOperation({ summary: "List active delivery assignments; drivers only receive their own" })
  myAssigned(@Req() req: AuthenticatedRequest, @Query() pagination: PaginationDto) {
    return this.service.myAssignedShipments(req.tenantId, req.user.sub, pagination);
  }

  @Get()
  @RequirePermissions("shipments.read")
  @ApiOperation({ summary: "List shipments" })
  @ApiQuery({ name: "status", required: false, enum: ShipmentStatus })
  @ApiQuery({ name: "customerId", required: false })
  @ApiQuery({ name: "search", required: false })
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginationDto,
    @Query("status") status?: ShipmentStatus,
    @Query("customerId") customerId?: string,
    @Query("search") search?: string,
  ) {
    return this.service.findAll(req.tenantId, query, { status, customerId, search });
  }

  @Get(":id")
  @RequirePermissions("shipments.read")
  @ApiOperation({ summary: "Get shipment detail with events" })
  findOne(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.findOne(req.tenantId, id);
  }

  @Post()
  @RequirePermissions("shipments.create")
  @ApiHeader({ name: "Idempotency-Key", required: true, description: "Reuse this key if retrying the same shipment creation request" })
  @ApiOperation({ summary: "Create a shipment" })
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateShipmentDto) {
    return this.service.create(req.tenantId, req.user.sub, body);
  }

  @Post("batch")
  @RequirePermissions("shipments.create")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Create up to 100 shipments with row-level results" })
  createBatch(@Req() req: AuthenticatedRequest, @Body() body: BatchCreateShipmentsDto) {
    return this.service.createBatch(req.tenantId, req.user.sub, body.shipments);
  }

  @Post("batch/cancel")
  @RequirePermissions("shipments.cancel")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Cancel up to 100 shipments through the normal state transition workflow" })
  cancelBatch(@Req() req: AuthenticatedRequest, @Body() body: BulkRecordIdsDto) {
    return this.service.cancelBatch(req.tenantId, body.ids, req.user.sub);
  }

  @Patch(":id")
  @RequirePermissions("shipments.update")
  @ApiOperation({ summary: "Update a shipment (only in BOOKED status)" })
  update(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdateShipmentDto) {
    return this.service.update(req.tenantId, id, body);
  }

  @Post(":id/events")
  @RequirePermissions("tracking.create")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Add a tracking event / status transition" })
  addEvent(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: CreateEventDto) {
    return this.service.addEvent(req.tenantId, id, req.user.sub, body);
  }

  @Patch(":id/assignment")
  @RequirePermissions("shipments.assign")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Assign a tenant driver to a shipment" })
  assignDriver(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: AssignDriverDto) {
    return this.service.assignDriver(req.tenantId, id, body.driverId, req.user.sub);
  }

  @Post(":id/deliver")
  @RequirePermissions("delivery.proof.create")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Record proof of delivery and complete a shipment" })
  deliver(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: ProofOfDeliveryDto) {
    return this.service.deliver(req.tenantId, id, req.user.sub, body);
  }

  @Post(":id/cancel")
  @RequirePermissions("shipments.cancel")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Cancel a shipment" })
  cancel(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.cancel(req.tenantId, id, req.user.sub);
  }
}

// Public tracking controller (no auth required)
@ApiTags("tracking")
@Controller("tracking")
export class TrackingController {
  constructor(private readonly service: ShipmentsService) {}

  @Get(":trackingNumber")
  @ApiOperation({ summary: "Public shipment tracking lookup" })
  track(@Param("trackingNumber") trackingNumber: string) {
    return this.service.findByTrackingNumber(trackingNumber);
  }
}

