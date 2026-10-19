import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard, PermissionGuard, RequirePermissions, TenantGuard } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { PaginationDto } from "../common/dto/pagination.dto";
import { CreatePackageTypeDto, UpdatePackageTypeStatusDto } from "./dto/package-type.dto";
import { PackagingService } from "./packaging.service";

@ApiTags("packaging")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("packaging/types")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class PackagingController {
  constructor(private readonly packaging: PackagingService) {}

  @Get()
  @RequirePermissions("packaging.types.read")
  @ApiOperation({ summary: "List package types in the current workspace" })
  list(@Req() req: AuthenticatedRequest, @Query() query: PaginationDto) { return this.packaging.listTypes(req.tenantId, query); }

  @Post()
  @RequirePermissions("packaging.types.manage")
  @ApiOperation({ summary: "Create a tenant package type" })
  create(@Req() req: AuthenticatedRequest, @Body() body: CreatePackageTypeDto) {
    return this.packaging.createType(req.tenantId, req.user.sub, body);
  }

  @Patch(":id/status")
  @RequirePermissions("packaging.types.manage")
  @ApiOperation({ summary: "Activate or deactivate a package type" })
  setActive(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdatePackageTypeStatusDto) {
    return this.packaging.setTypeActive(req.tenantId, req.user.sub, id, body.isActive);
  }
}
