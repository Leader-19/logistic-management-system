import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsArray, IsInt, IsString, IsUUID, Length, Max, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";
import { TenantStatus } from "@prisma/client";
import { AuthGuard } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformService } from "./platform.service";

class StartSupportSessionDto {
  @IsUUID() tenantId!: string;
  @IsString() @Length(5, 500) reason!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(240) durationMinutes!: number;
  @IsArray() @IsString({ each: true }) @MaxLength(80, { each: true }) permissionKeys!: string[];
}

class DeleteTenantDto {
  @IsString() @Length(5, 500) reason!: string;
  @IsString() @Length(1, 120) confirmationSlug!: string;
}

@ApiTags("platform administration")
@ApiBearerAuth()
@Controller("platform")
@UseGuards(AuthGuard, PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly service: PlatformService) { }

  @Get("overview")
  @ApiOperation({ summary: "Get cross-tenant platform overview metrics" })
  overview() {
    return this.service.getOverview();
  }

  @Get("tenants")
  @ApiOperation({ summary: "Search tenants for platform support" })
  listTenants(@Query() pagination: PaginationDto, @Query("search") search?: string, @Query("status") status?: TenantStatus) {
    return this.service.listTenants(pagination, search, status);
  }

  @Post("tenants/:id/delete")
  @ApiOperation({ summary: "Cancel tenant access while retaining tenant records and audit history" })
  deleteTenant(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string, @Body() body: DeleteTenantDto) {
    return this.service.deleteTenant(request.user.sub, id, body);
  }

  @Get("permissions")
  @ApiOperation({ summary: "List permission scopes available for a support session" })
  listPermissions() {
    return this.service.listPermissions();
  }

  @Get("support-sessions")
  @ApiOperation({ summary: "List recent support sessions created by the current admin" })
  listSessions(@Req() request: AuthenticatedRequest) {
    return this.service.listSessions(request.user.sub);
  }

  @Post("support-sessions")
  @ApiOperation({ summary: "Start a time-limited, permission-scoped tenant support session" })
  startSession(@Req() request: AuthenticatedRequest, @Body() body: StartSupportSessionDto) {
    return this.service.startSession(request.user.sub, body);
  }

  @Post("support-sessions/:id/end")
  @ApiOperation({ summary: "End a platform support session" })
  endSession(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.endSession(request.user.sub, id);
  }
}
