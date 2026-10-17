import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { AuthGuard, PermissionGuard, RequirePermissions, TenantGuard } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { FleetService } from "./fleet.service";

class CreateVehicleDto {
  @IsString() @Length(1, 32) registration!: string;
  @IsString() @Length(1, 80) vehicleType!: string;
  @IsOptional() @IsString() @MaxLength(80) make?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) @Max(1000000) capacityKg?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class UpdateVehicleDto {
  @IsOptional() @IsIn(["ACTIVE", "MAINTENANCE", "RETIRED"]) status?: string;
  @IsOptional() @IsString() @MaxLength(80) make?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) @Max(1000000) capacityKg?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

@ApiTags("fleet")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("fleet/vehicles")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get()
  @RequirePermissions("fleet.read")
  list(@Req() req: AuthenticatedRequest) { return this.fleet.list(req.tenantId); }

  @Post()
  @RequirePermissions("fleet.create")
  @ApiOperation({ summary: "Register a tenant vehicle" })
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateVehicleDto) { return this.fleet.create(req.tenantId, req.user.sub, body); }

  @Patch(":id")
  @RequirePermissions("fleet.update")
  update(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdateVehicleDto) { return this.fleet.update(req.tenantId, id, req.user.sub, body); }
}
