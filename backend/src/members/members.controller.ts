import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { AuthGuard, TenantGuard, PermissionGuard, RequirePermissions } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { PaginationDto } from "../common/dto/pagination.dto";
import { MembersService } from "./members.service";

class InviteMemberDto {
  @IsEmail() email!: string;
  @IsString() @Length(2, 120) fullName!: string;
  @IsArray() @IsUUID("4", { each: true }) roleIds!: string[];
  @IsOptional() @IsUUID() branchId?: string;
}

class CreateMemberAccountDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(2, 120) fullName!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
  @IsArray() @ArrayMinSize(1) @IsUUID("4", { each: true }) roleIds!: string[];
  @IsOptional() @IsUUID() branchId?: string;
}

class BatchMemberRowDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(2, 120) fullName!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}

class BatchCreateMembersDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => BatchMemberRowDto) users!: BatchMemberRowDto[];
  @IsArray() @ArrayMinSize(1) @IsUUID("4", { each: true }) roleIds!: string[];
  @IsOptional() @IsUUID() branchId?: string;
}

class UpdateMemberDto {
  @IsOptional() @IsEnum(["ACTIVE", "INACTIVE", "INVITED"]) status?: string;
  @IsOptional() @IsUUID() branchId?: string | null;
}

class AssignRolesDto {
  @IsArray() @IsUUID("4", { each: true }) roleIds!: string[];
}

class AcceptInvitationDto {
  @IsString() @Length(32, 128) token!: string;
  @IsOptional() @IsString() @MinLength(12) @MaxLength(128) password?: string;
}

@ApiTags("members")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("members")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class MembersController {
  constructor(private readonly service: MembersService) { }

  @Get()
  @RequirePermissions("members.read")
  @ApiOperation({ summary: "List tenant members" })
  @ApiQuery({ name: "search", required: false })
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginationDto,
    @Query("search") search?: string,
  ) {
    return this.service.findAll(req.tenantId, query, search);
  }

  @Get(":id")
  @RequirePermissions("members.read")
  @ApiOperation({ summary: "Get member detail with roles and permissions" })
  findOne(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.findOne(req.tenantId, id);
  }

  @Post("invite")
  @RequirePermissions("members.create")
  @ApiOperation({ summary: "Invite a new member" })
  invite(@Req() req: AuthenticatedRequest, @Body() body: InviteMemberDto) {
    return this.service.invite(req.tenantId, req.user.sub, body, this.grantedKeys(req));
  }

  @Post("create")
  @RequirePermissions("members.create")
  @ApiOperation({ summary: "Create a member account with immediate sign-in access" })
  createAccount(@Req() req: AuthenticatedRequest, @Body() body: CreateMemberAccountDto) {
    return this.service.createAccount(req.tenantId, req.user.sub, body, this.grantedKeys(req));
  }

  @Post("batch")
  @RequirePermissions("members.create")
  @ApiOperation({ summary: "Create up to 100 member accounts from validated CSV data" })
  createBatch(@Req() req: AuthenticatedRequest, @Body() body: BatchCreateMembersDto) {
    return this.service.createBatch(req.tenantId, req.user.sub, body, this.grantedKeys(req));
  }

  @Patch(":id")
  @RequirePermissions("members.update")
  @ApiOperation({ summary: "Update member status or branch" })
  update(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdateMemberDto) {
    return this.service.update(req.tenantId, id, body);
  }

  @Post(":id/roles")
  @RequirePermissions("members.update")
  @ApiOperation({ summary: "Assign roles to member (replaces all)" })
  assignRoles(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: AssignRolesDto) {
    return this.service.assignRoles(req.tenantId, id, body.roleIds, this.grantedKeys(req));
  }

  @Delete(":id")
  @RequirePermissions("members.delete")
  @ApiOperation({ summary: "Deactivate a member" })
  deactivate(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.service.deactivate(req.tenantId, id, req.user.sub);
  }

  private grantedKeys(req: AuthenticatedRequest): string[] {
    return req.membership.membershipRoles.flatMap(({ role }) => role.rolePermissions.map(({ permission }) => `${permission.resource}.${permission.action}`));
  }
}

@ApiTags("invitations")
@Controller("invitations")
export class InvitationsController {
  constructor(private readonly service: MembersService) { }

  @Post("accept")
  @ApiOperation({ summary: "Accept a tenant invitation and set the account password" })
  accept(@Body() body: AcceptInvitationDto) {
    return this.service.acceptInvitation(body.token, body.password);
  }
}

