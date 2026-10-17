import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard, TenantGuard, PermissionGuard, RequirePermissions } from "../common/guards";
import { PermissionsService } from "./permissions.service";

@ApiTags("permissions")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("permissions")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Get()
  @RequirePermissions("permissions.read")
  @ApiOperation({ summary: "List all available permissions" })
  findAll() {
    return this.service.findAll();
  }
}

