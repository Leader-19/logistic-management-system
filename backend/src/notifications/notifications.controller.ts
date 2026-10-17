import { Controller, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard, PermissionGuard, RequirePermissions, TenantGuard } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { PaginationDto } from "../common/dto/pagination.dto";
import { NotificationsService } from "./notifications.service";
@ApiTags("notifications")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("notifications")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get() @RequirePermissions("notifications.read") @ApiOperation({ summary: "List the current user's tenant notifications" })
  list(@Req() req: AuthenticatedRequest, @Query() pagination: PaginationDto) { return this.service.list(req.tenantId, req.user.sub, pagination); }
  @Patch(":id/read") @RequirePermissions("notifications.update") @ApiOperation({ summary: "Mark one of the current user's tenant notifications as read" })
  markRead(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.service.markRead(req.tenantId, req.user.sub, id); }
}
