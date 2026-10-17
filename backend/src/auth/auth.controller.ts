import { BadRequestException, Body, Controller, Get, Headers, Patch, Post, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, Length, MaxLength, MinLength } from "class-validator";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthService } from "./auth.service";
import { AuthGuard, Public } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";

// ─── DTOs ─────────────────────────────────────────────────
export class RegisterDto {
  @IsString() @Length(2, 120) tenantName!: string;
  @IsString() @Length(2, 120) fullName!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}

export class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(2, 120) fullName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
}

export class ChangePasswordDto {
  @IsString() @MinLength(12) @MaxLength(128) currentPassword!: string;
  @IsString() @MinLength(12) @MaxLength(128) newPassword!: string;
}

// ─── Controller ───────────────────────────────────────────
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @ApiOperation({ summary: "Register a new tenant and owner user" })
  @ApiResponse({ status: 201, description: "Tenant created successfully" })
  @ApiResponse({ status: 409, description: "Email already exists" })
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @Post("login")
  @ApiOperation({ summary: "Login with email and password" })
  @ApiResponse({ status: 200, description: "Login successful" })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user profile with memberships" })
  @ApiResponse({ status: 200, description: "User profile" })
  me(@Req() req: AuthenticatedRequest) {
    return this.auth.getProfile(req.user.sub);
  }

  @Patch("me")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update the current user's profile" })
  updateMe(@Req() req: AuthenticatedRequest, @Body() body: UpdateProfileDto) {
    return this.auth.updateProfile(req.user.sub, body);
  }

  @Post("me/password")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change the current user's password" })
  changePassword(@Req() req: AuthenticatedRequest, @Body() body: ChangePasswordDto) {
    return this.auth.changePassword(req.user.sub, body.currentPassword, body.newPassword);
  }

  @Post("me/avatar")
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }))
  @ApiBearerAuth()
  @ApiOperation({ summary: "Upload a private PNG, JPEG, or WebP profile picture (maximum 2 MB)" })
  uploadAvatar(@Req() req: AuthenticatedRequest, @UploadedFile() file?: { buffer: Buffer }) {
    if (!file) throw new BadRequestException("Choose an image file to upload");
    return this.auth.uploadAvatar(req.user.sub, file);
  }

  @Get("me/avatar")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the current user's private profile picture" })
  async avatar(@Req() req: AuthenticatedRequest) {
    const avatar = await this.auth.getAvatar(req.user.sub);
    return new StreamableFile(avatar.buffer, { type: avatar.mimeType, disposition: "inline" });
  }

  @Get("tenant-context")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Validate the current user's access to a tenant workspace" })
  tenantContext(
    @Req() req: AuthenticatedRequest,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-platform-support-session") supportSessionId?: string,
  ) {
    return this.auth.getTenantContext(req.user.sub, tenantId, supportSessionId);
  }
}

