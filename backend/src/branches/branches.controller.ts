import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, Length } from "class-validator";
import { AuthGuard, TenantGuard, PermissionGuard, RequirePermissions } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { PaginationDto } from "../common/dto/pagination.dto";
import { BulkRecordIdsDto } from "../common/dto/bulk-record-ids.dto";
import { BranchesService } from "./branches.service";

class CreateBranchDto {
  @IsString() @Length(2, 100) name!: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
}

class UpdateBranchDto {
  @IsOptional() @IsString() @Length(2, 100) name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags("branches")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("branches")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class BranchesController {
  constructor(private readonly service: BranchesService) {}

  @Get()
  @RequirePermissions("branches.read")
  @ApiOperation({ summary: "List branches" })
  findAll(@Req() req: AuthenticatedRequest, @Query() query: PaginationDto) {
    return this.service.findAll(req.tenantId, query);
  }

  @Post("bulk/deactivate")
  @RequirePermissions("branches.delete")
  @ApiOperation({ summary: "Deactivate up to 100 branches in the current tenant" })
  bulkDeactivate(@Req() req: AuthenticatedRequest, @Body() body: BulkRecordIdsDto) {
    return this.service.bulkDeactivate(req.tenantId, req.user.sub, body.ids);
  }

  @Get(":id")
  @RequirePermissions("branches.read")
  @ApiOperation({ summary: "Get branch detail" })
  findOne(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.findOne(req.tenantId, id);
  }

  @Post()
  @RequirePermissions("branches.create")
  @ApiOperation({ summary: "Create a branch" })
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateBranchDto) {
    return this.service.create(req.tenantId, body);
  }

  @Patch(":id")
  @RequirePermissions("branches.update")
  @ApiOperation({ summary: "Update a branch" })
  update(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdateBranchDto) {
    return this.service.update(req.tenantId, id, body);
  }

  @Delete(":id")
  @RequirePermissions("branches.delete")
  @ApiOperation({ summary: "Deactivate a branch (soft-delete)" })
  remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.remove(req.tenantId, id);
  }
}

