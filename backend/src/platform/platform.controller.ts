import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from "class-validator";
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

class PlatformPlanDto {
  @IsString() @Length(2, 80) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsString() @Matches(/^(?:0|0\.\d{1,2}|[1-9]\d{0,7}(?:\.\d{1,2})?)$/) monthlyPrice!: string;
  @IsString() @Matches(/^(?:0|0\.\d{1,2}|[1-9]\d{0,7}(?:\.\d{1,2})?)$/) yearlyPrice!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) maxUsers!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class CreatePlatformTenantDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(2, 120) ownerName!: string;
  @IsEmail() @MaxLength(254) ownerEmail!: string;
}

class PlatformTenantQueryDto extends PaginationDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsEnum(TenantStatus) status?: TenantStatus;
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

  @Get("activity")
  @ApiOperation({ summary: "Get recent audited activity across platform tenants" })
  listActivity(@Query() pagination: PaginationDto) {
    return this.service.listActivity(pagination);
  }

  @Get("tenants")
  @ApiOperation({ summary: "Search tenants for platform support" })
  listTenants(@Query() query: PlatformTenantQueryDto) {
    return this.service.listTenants(query, query.search, query.status);
  }

  @Post("tenants")
  @ApiOperation({ summary: "Create a tenant workspace and invite its owner" })
  createTenant(@Req() request: AuthenticatedRequest, @Body() body: CreatePlatformTenantDto) {
    return this.service.createTenant(request.user.sub, body);
  }

  @Get("plans")
  @ApiOperation({ summary: "List subscription plans for platform administration" })
  listPlans(@Query() pagination: PaginationDto) { return this.service.listPlans(pagination); }

  @Post("plans")
  @ApiOperation({ summary: "Create a subscription plan with a user seat limit" })
  createPlan(@Req() request: AuthenticatedRequest, @Body() body: PlatformPlanDto) {
    return this.service.createPlan(request.user.sub, body);
  }

  @Patch("plans/:id")
  @ApiOperation({ summary: "Update plan price, seat limit, or availability" })
  updatePlan(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string, @Body() body: PlatformPlanDto) {
    return this.service.updatePlan(request.user.sub, id, body);
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
