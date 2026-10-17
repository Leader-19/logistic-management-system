import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { AuthGuard, TenantGuard, PermissionGuard, RequirePermissions } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { PaginationDto } from "../common/dto/pagination.dto";
import { RolesService } from "./roles.service";

class CreateRoleDto {
  @IsString() @Length(2, 100) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsUUID("4", { each: true }) permissionIds?: string[];
}

class UpdateRoleDto {
  @IsOptional() @IsString() @Length(2, 100) name?: string;
  @IsOptional() @IsString() description?: string;
}

class SetPermissionsDto {
  @IsArray() @IsUUID("4", { each: true }) permissionIds!: string[];
}

@ApiTags("roles")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("roles")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get()
  @RequirePermissions("roles.read")
  @ApiOperation({ summary: "List roles for current tenant" })
  findAll(@Req() req: AuthenticatedRequest, @Query() query: PaginationDto) {
    return this.service.findAll(req.tenantId, query);
  }

  @Get(":id")
  @RequirePermissions("roles.read")
  @ApiOperation({ summary: "Get role detail with permissions" })
  findOne(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.findOne(req.tenantId, id);
  }

  @Post()
  @RequirePermissions("roles.manage")
  @ApiOperation({ summary: "Create a custom role" })
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateRoleDto) {
    return this.service.create(req.tenantId, body, this.grantedKeys(req));
  }

  @Patch(":id")
  @RequirePermissions("roles.manage")
  @ApiOperation({ summary: "Update a custom role" })
  update(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdateRoleDto) {
    return this.service.update(req.tenantId, id, body);
  }

  @Delete(":id")
  @RequirePermissions("roles.manage")
  @ApiOperation({ summary: "Delete a custom role" })
  remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.remove(req.tenantId, id);
  }

  @Post(":id/permissions")
  @RequirePermissions("roles.manage")
  @ApiOperation({ summary: "Set permissions for a role (replaces all)" })
  setPermissions(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: SetPermissionsDto) {
    return this.service.setPermissions(req.tenantId, id, body.permissionIds, this.grantedKeys(req));
  }

  private grantedKeys(req: AuthenticatedRequest): string[] {
    return req.membership.membershipRoles.flatMap(({ role }) => role.rolePermissions.map(({ permission }) => `${permission.resource}.${permission.action}`));
  }
}

