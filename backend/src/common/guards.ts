import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { isUUID } from "class-validator";
import { PrismaService } from "./prisma.service";
import { AuthService } from "../auth/auth.service";

// ─── Permission Decorator ────────────────────────────────────
const PERMISSION_KEY = "required_permissions";
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSION_KEY, permissions);

// Mark a route as public (no auth required)
const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// ─── Auth Guard ──────────────────────────────────────────────
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer "))
      throw new UnauthorizedException("Bearer token required");

    const payload = this.auth.verifyToken(header.slice(7));
    request.user = { ...payload, id: payload.sub };
    return true;
  }
}

// ─── Tenant Context Guard ────────────────────────────────────
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.headers["x-tenant-id"];

    if (typeof tenantId !== "string" || !isUUID(tenantId))
      throw new UnauthorizedException("Valid x-tenant-id header required");

    const supportSessionId = request.headers["x-platform-support-session"];
    if (typeof supportSessionId === "string") {
      const supportSession = isUUID(supportSessionId)
        ? await this.prisma.platformSupportSession.findFirst({
            where: {
              id: supportSessionId,
              tenantId,
              adminUserId: request.user.sub,
              endedAt: null,
              expiresAt: { gt: new Date() },
            },
            include: { tenant: true },
          })
        : null;
      const platformAdmin = await this.prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { isActive: true, isPlatformAdmin: true },
      });
      if (!supportSession || !platformAdmin?.isActive || !platformAdmin.isPlatformAdmin) {
        if (platformAdmin?.isPlatformAdmin) {
          await this.prisma.auditLog.create({
            data: {
              tenantId: supportSession?.tenantId ?? null,
              actorId: request.user.sub,
              action: "platform.support.denied",
              targetType: "platform_support_session",
              targetId: supportSessionId,
              outcome: "denied",
              metadata: { reason: "invalid, ended, or expired session", path: request.route?.path ?? request.path },
              ipAddress: request.ip,
              userAgent: request.get("user-agent")?.slice(0, 500),
            },
          });
        }
        throw new UnauthorizedException("This platform support session is invalid, ended, or expired");
      }
      if (supportSession.tenant.status !== "ACTIVE") {
        await this.prisma.auditLog.create({
          data: {
            tenantId,
            actorId: request.user.sub,
            action: "platform.support.denied",
            targetType: "platform_support_session",
            targetId: supportSession.id,
            outcome: "denied",
            metadata: { reason: "tenant suspended", path: request.route?.path ?? request.path },
            ipAddress: request.ip,
            userAgent: request.get("user-agent")?.slice(0, 500),
          },
        });
        throw new ForbiddenException("This tenant account is currently suspended");
      }
      const availablePermissions = await this.prisma.permission.findMany();
      const permissionRoles = availablePermissions
        .filter((permission) => supportSession.permissionKeys.includes(`${permission.resource}.${permission.action}`))
        .map((permission) => ({ permission: { resource: permission.resource, action: permission.action } }));
      request.tenantId = tenantId;
      request.tenant = supportSession.tenant;
      request.membership = {
        id: supportSession.id,
        tenantId,
        userId: request.user.sub,
        status: "ACTIVE",
        branchId: null,
        membershipRoles: [{ role: { id: supportSession.id, name: "Platform support", rolePermissions: permissionRoles } }],
      };
      request.platformSupportSession = supportSession;
      return true;
    }

    const membership = await this.prisma.tenantMembership.findUnique({
      where: {
        tenantId_userId: { tenantId, userId: request.user.sub },
      },
      include: {
        tenant: true,
        membershipRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!membership || membership.status !== "ACTIVE")
      throw new UnauthorizedException("You are not an active member of this tenant");

    if (membership.tenant.status !== "ACTIVE")
      throw new ForbiddenException("This tenant account is currently suspended");

    request.tenantId = tenantId;
    request.tenant = membership.tenant;
    request.membership = membership;
    return true;
  }
}

// ─── Permission Guard ────────────────────────────────────────
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (!required.length) return true;

    const request = context.switchToHttp().getRequest();
    const membership = request.membership;

    if (!membership)
      throw new ForbiddenException("No tenant context");

    // Collect all permissions from all roles assigned to this membership
    const grantedPermissions = new Set<string>();
    for (const mr of membership.membershipRoles || []) {
      for (const rp of mr.role.rolePermissions || []) {
        grantedPermissions.add(`${rp.permission.resource}.${rp.permission.action}`);
        // Also add wildcard check
        grantedPermissions.add(`${rp.permission.resource}.*`);
      }
      // If role has a 'manage' permission for a resource, it implies all actions
      for (const rp of mr.role.rolePermissions || []) {
        if (rp.permission.action === "manage") {
          grantedPermissions.add(`${rp.permission.resource}.create`);
          grantedPermissions.add(`${rp.permission.resource}.read`);
          grantedPermissions.add(`${rp.permission.resource}.update`);
          grantedPermissions.add(`${rp.permission.resource}.delete`);
          grantedPermissions.add(`${rp.permission.resource}.export`);
        }
      }
    }

    // Check if user has a system owner/admin role (has *.* permission)
    if (grantedPermissions.has("*.*")) return true;

    const hasAll = required.every((perm) => grantedPermissions.has(perm));
    if (!hasAll) {
      if (request.platformSupportSession) {
        await this.prisma.auditLog.create({
          data: {
            tenantId: request.tenantId,
            actorId: request.user.sub,
            action: "platform.support.permission_denied",
            targetType: "http_request",
            targetId: (request.route?.path ?? request.path).slice(0, 255),
            outcome: "denied",
            metadata: { supportSessionId: request.platformSupportSession.id, requiredPermissions: required, path: request.route?.path ?? request.path },
            ipAddress: request.ip,
            userAgent: request.get("user-agent")?.slice(0, 500),
          },
        });
      }
      throw new ForbiddenException(
        `Missing permissions: ${required.filter((p) => !grantedPermissions.has(p)).join(", ")}`,
      );
    }

    return true;
  }
}

