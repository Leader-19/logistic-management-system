import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, Length } from "class-validator";
import { AuthGuard, TenantGuard, PermissionGuard, RequirePermissions } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { PaginationDto } from "../common/dto/pagination.dto";
import { BulkRecordIdsDto } from "../common/dto/bulk-record-ids.dto";
import { CustomersService } from "./customers.service";

class CreateCustomerDto {
  @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() zipCode?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() notes?: string;
}

class UpdateCustomerDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() zipCode?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags("customers")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("customers")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  @RequirePermissions("customers.read")
  @ApiOperation({ summary: "List customers" })
  @ApiQuery({ name: "search", required: false })
  findAll(@Req() req: AuthenticatedRequest, @Query() query: PaginationDto, @Query("search") search?: string) {
    return this.service.findAll(req.tenantId, query, search);
  }

  @Post("bulk/deactivate")
  @RequirePermissions("customers.delete")
  @ApiOperation({ summary: "Deactivate up to 100 customers in the current tenant" })
  bulkDeactivate(@Req() req: AuthenticatedRequest, @Body() body: BulkRecordIdsDto) {
    return this.service.bulkDeactivate(req.tenantId, req.user.sub, body.ids);
  }

  @Get(":id")
  @RequirePermissions("customers.read")
  @ApiOperation({ summary: "Get customer detail" })
  findOne(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.findOne(req.tenantId, id);
  }

  @Post()
  @RequirePermissions("customers.create")
  @ApiOperation({ summary: "Create a customer" })
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateCustomerDto) {
    return this.service.create(req.tenantId, body);
  }

  @Patch(":id")
  @RequirePermissions("customers.update")
  @ApiOperation({ summary: "Update a customer" })
  update(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdateCustomerDto) {
    return this.service.update(req.tenantId, id, body);
  }

  @Delete(":id")
  @RequirePermissions("customers.delete")
  @ApiOperation({ summary: "Deactivate a customer (soft-delete)" })
  remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.remove(req.tenantId, id);
  }
}

