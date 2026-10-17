import { BadRequestException, Body, Controller, Get, Patch, Post, Put, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, Length, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard, TenantGuard, PermissionGuard, RequirePermissions } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { TenantsService } from "./tenants.service";

class UpdateTenantDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsString() logo?: string;
}

class SettingItem {
  @IsString() key!: string;
  @IsString() value!: string;
}

class UpdateSettingsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => SettingItem)
  settings!: SettingItem[];
}

@ApiTags("tenants")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("tenants")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class TenantsController {
  constructor(private readonly service: TenantsService) { }

  @Get("current")
  @RequirePermissions("tenants.read")
  @ApiOperation({ summary: "Get current tenant details" })
  findCurrent(@Req() req: AuthenticatedRequest) {
    return this.service.findCurrent(req.tenantId);
  }

  @Patch("current")
  @RequirePermissions("tenants.update")
  @ApiOperation({ summary: "Update current tenant profile" })
  updateCurrent(@Req() req: AuthenticatedRequest, @Body() body: UpdateTenantDto) {
    return this.service.updateCurrent(req.tenantId, body);
  }

  @Post("current/logo")
  @RequirePermissions("tenants.update")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 3 * 1024 * 1024 } }))
  @ApiOperation({ summary: "Upload a private company logo (PNG, JPEG, or WebP; maximum 3 MB)" })
  uploadLogo(@Req() req: AuthenticatedRequest, @UploadedFile() file?: { buffer: Buffer }) {
    if (!file) throw new BadRequestException("Choose a company logo to upload");
    return this.service.uploadLogo(req.tenantId, file);
  }

  @Get("current/logo")
  @RequirePermissions("tenants.read")
  async logo(@Req() req: AuthenticatedRequest) {
    const logo = await this.service.getLogo(req.tenantId);
    return new StreamableFile(logo.buffer, { type: logo.mimeType, disposition: "inline" });
  }
  @Get("current/settings")
  @RequirePermissions("settings.read")
  @ApiOperation({ summary: "Get tenant settings" })
  getSettings(@Req() req: AuthenticatedRequest) {
    return this.service.getSettings(req.tenantId);
  }

  @Put("current/settings")
  @RequirePermissions("settings.update")
  @ApiOperation({ summary: "Update tenant settings" })
  updateSettings(@Req() req: AuthenticatedRequest, @Body() body: UpdateSettingsDto) {
    return this.service.updateSettings(req.tenantId, body.settings);
  }
}





