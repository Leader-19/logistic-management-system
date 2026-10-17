import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AuthGuard, TenantGuard, PermissionGuard, RequirePermissions } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { PaginationDto } from "../common/dto/pagination.dto";
import { AuditLogsService } from "./audit.service";

@ApiTags("audit")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("audit-logs")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class AuditController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  @RequirePermissions("audit.read")
  @ApiOperation({ summary: "List audit logs" })
  @ApiQuery({ name: "action", required: false })
  @ApiQuery({ name: "targetType", required: false })
  @ApiQuery({ name: "actorId", required: false })
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginationDto,
    @Query("action") action?: string,
    @Query("targetType") targetType?: string,
    @Query("actorId") actorId?: string,
  ) {
    return this.service.findAll(req.tenantId, query, { action, targetType, actorId });
  }
}

