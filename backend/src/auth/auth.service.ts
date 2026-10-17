import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { createHmac, pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isUUID } from "class-validator";
import { promisify } from "node:util";
import { PrismaService } from "../common/prisma.service";
import { storagePath } from "../common/storage";
import { TokenPayload } from "../common/interfaces";

const deriveKey = promisify(pbkdf2);
const ITERATIONS = 310_000;
const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/** Default permissions seeded on first tenant registration */
const DEFAULT_PERMISSIONS: Array<{ resource: string; action: string; description: string }> = [];
const RESOURCES = [
  "tenants", "users", "members", "roles", "permissions", "branches",
  "customers", "shipments", "tracking", "invoices", "payments", "products", "warehouse", "fleet", "dispatch",
  "reports", "audit", "plans", "subscriptions", "settings", "notifications",
];
const ACTIONS = ["create", "read", "update", "delete", "manage", "export"];
for (const resource of RESOURCES) {
  for (const action of ACTIONS) {
    DEFAULT_PERMISSIONS.push({
      resource,
      action,
      description: `${action} ${resource}`,
    });
  }
}
// Extra fine-grained permissions
DEFAULT_PERMISSIONS.push(
  { resource: "shipments", action: "assign", description: "Assign shipments to drivers/carriers" },
  { resource: "shipments", action: "cancel", description: "Cancel shipments" },
  { resource: "tracking", action: "create", description: "Create tracking events" },
  { resource: "delivery", action: "proof.create", description: "Submit proof of delivery" },
  { resource: "settlements", action: "approve", description: "Approve settlements" },
  { resource: "warehouse.stock", action: "adjust", description: "Receive or adjust warehouse stock" },
);

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(userId: string, input: { fullName?: string; phone?: string | null }) {
    const data = {
      ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id: userId }, data, select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true } });
      await tx.auditLog.create({ data: { actorId: userId, action: "profile.updated", targetType: "user", targetId: userId, metadata: { fields: Object.keys(data) } } });
      return user;
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user || !(await this.verifyPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    if (currentPassword === newPassword) throw new ConflictException("Choose a password different from your current password");
    const passwordHash = await this.hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.auditLog.create({ data: { actorId: userId, action: "auth.password.changed", targetType: "user", targetId: userId } });
    });
    return { message: "Password changed successfully" };
  }

  async uploadAvatar(userId: string, file: { buffer: Buffer }) {
    const mimeType = this.avatarMimeType(file.buffer);
    if (!mimeType) throw new BadRequestException("Choose a valid PNG, JPEG, or WebP image.");
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
    const directory = storagePath("avatars");
    await mkdir(directory, { recursive: true });
    for (const oldExtension of ["png", "jpg", "webp"]) {
      await unlink(resolve(directory, `${userId}.${oldExtension}`)).catch(() => undefined);
    }
    await writeFile(resolve(directory, `${userId}.${extension}`), file.buffer, { mode: 0o600 });
    const avatarUrl = `/api/profile/avatar?v=${Date.now()}`;
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id: userId }, data: { avatarUrl }, select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true } });
      await tx.auditLog.create({ data: { actorId: userId, action: "profile.avatar.updated", targetType: "user", targetId: userId, metadata: { mimeType, bytes: file.buffer.byteLength } } });
      return user;
    });
  }

  async getAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    if (!user?.avatarUrl) throw new NotFoundException("Profile picture not found");
    const directory = storagePath("avatars");
    for (const [extension, mimeType] of [["png", "image/png"], ["jpg", "image/jpeg"], ["webp", "image/webp"]] as const) {
      try {
        return { buffer: await readFile(resolve(directory, `${userId}.${extension}`)), mimeType };
      } catch { /* Try the next supported image format. */ }
    }
    throw new NotFoundException("Profile picture file not found");
  }

  private avatarMimeType(buffer: Buffer): string | null {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
    return null;
  }

  async onModuleInit(): Promise<void> {
    await this.seedPermissions();
  }

  /** Seed default permissions if they don't exist */
  async seedPermissions(): Promise<void> {
    await this.prisma.permission.createMany({
      data: DEFAULT_PERMISSIONS,
      skipDuplicates: true,
    });
    const [permissions, ownerRoles, adminRoles, opsRoles, financeRoles, driverRoles, customerServiceRoles] = await Promise.all([
      this.prisma.permission.findMany({ select: { id: true, resource: true, action: true } }),
      this.prisma.role.findMany({
        where: { tenantId: { not: null }, name: "Owner", isSystem: true },
        select: { id: true },
      }),
      this.prisma.role.findMany({ where: { tenantId: { not: null }, name: "Admin", isSystem: true }, select: { id: true } }),
      this.prisma.role.findMany({ where: { tenantId: { not: null }, name: "Operations", isSystem: true }, select: { id: true } }),
      this.prisma.role.findMany({ where: { tenantId: { not: null }, name: "Finance", isSystem: true }, select: { id: true } }),
      this.prisma.role.findMany({ where: { tenantId: { not: null }, name: "Driver", isSystem: true }, select: { id: true } }),
      this.prisma.role.findMany({ where: { tenantId: { not: null }, name: "Customer Service", isSystem: true }, select: { id: true } }),
    ]);
    const adminPermissionIds = (await this.prisma.permission.findMany({ where: { NOT: [{ resource: "plans" }, { resource: "subscriptions" }] }, select: { id: true } })).map(permission => permission.id);
    const opsPermissionIds = (await this.prisma.permission.findMany({ where: { OR: [
      { resource: { in: ["tenants", "customers", "shipments", "tracking", "branches", "reports", "products", "warehouse", "dispatch", "fleet", "notifications"] }, action: { in: ["create", "read", "update", "export"] } },
      { resource: "shipments", action: "assign" },
      { resource: "warehouse.stock", action: "adjust" },
    ] }, select: { id: true } })).map(permission => permission.id);
    const financePermissionIds = (await this.prisma.permission.findMany({ where: { resource: { in: ["tenants", "customers", "shipments", "invoices", "payments", "reports", "settlements", "notifications"] } }, select: { id: true } })).map(permission => permission.id);
    const driverPermissionIds = (await this.prisma.permission.findMany({ where: { OR: [
      { resource: "shipments", action: "read" },
      { resource: "tracking", action: { in: ["read", "create"] } },
      { resource: "delivery", action: "proof.create" },
      { resource: "notifications", action: { in: ["read", "update"] } },
    ] }, select: { id: true } })).map(permission => permission.id);
    const grants = [
      ...ownerRoles.flatMap(role => permissions.map(permission => ({ roleId: role.id, permissionId: permission.id }))),
      ...adminRoles.flatMap(role => adminPermissionIds.map(permissionId => ({ roleId: role.id, permissionId }))),
      ...opsRoles.flatMap(role => opsPermissionIds.map(permissionId => ({ roleId: role.id, permissionId }))),
      ...financeRoles.flatMap(role => financePermissionIds.map(permissionId => ({ roleId: role.id, permissionId }))),
      ...driverRoles.flatMap(role => driverPermissionIds.map(permissionId => ({ roleId: role.id, permissionId }))),
      ...customerServiceRoles.flatMap(role => permissions.filter(permission => permission.resource === "notifications" && ["read", "update"].includes(permission.action)).map(permission => ({ roleId: role.id, permissionId: permission.id }))),
    ];
    if (grants.length) await this.prisma.rolePermission.createMany({ data: grants, skipDuplicates: true });
  }

  async register(input: { tenantName: string; fullName: string; email: string; password: string }) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException("An account with this email already exists");

    const passwordHash = await this.hashPassword(input.password);
    const slugBase = input.tenantName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "company";
    const slug = `${slugBase}-${randomBytes(3).toString("hex")}`;

    // Seed permissions on first registration
    await this.seedPermissions();

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: input.tenantName.trim(), slug },
      });
      const user = await tx.user.create({
        data: { email, fullName: input.fullName.trim(), passwordHash },
      });
      const membership = await tx.tenantMembership.create({
        data: { tenantId: tenant.id, userId: user.id, status: "ACTIVE" },
      });

      // Create an "Owner" system role for this tenant with ALL permissions
      const allPermissions = await tx.permission.findMany();
      const ownerRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: "Owner",
          description: "Full access to all resources",
          isSystem: true,
          rolePermissions: {
            create: allPermissions.map((p) => ({ permissionId: p.id })),
          },
        },
      });

      // Also create default roles: Admin, Operations, Driver, Customer Service, Finance
      const adminPerms = allPermissions.filter((p) =>
        !["plans", "subscriptions"].includes(p.resource) || p.action === "read",
      );
      const adminRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: "Admin",
          description: "Tenant administrator with broad access",
          isSystem: true,
          rolePermissions: { create: adminPerms.map((p) => ({ permissionId: p.id })) },
        },
      });

      const opsResources = ["tenants", "customers", "shipments", "tracking", "branches", "reports", "products", "warehouse", "dispatch", "fleet", "notifications"];
      const opsPerms = allPermissions.filter((p) =>
        (opsResources.includes(p.resource) && ["create", "read", "update", "export"].includes(p.action)) ||
        (p.resource === "shipments" && p.action === "assign"),
      );
      await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: "Operations",
          description: "Operational staff",
          isSystem: true,
          rolePermissions: { create: opsPerms.map((p) => ({ permissionId: p.id })) },
        },
      });

      const driverPerms = allPermissions.filter((p) =>
        (p.resource === "shipments" && p.action === "read") ||
        (p.resource === "tracking" && ["read", "create"].includes(p.action)) ||
        (p.resource === "delivery" && p.action === "proof.create"),
      );
      await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: "Driver",
          description: "Driver with task and tracking access",
          isSystem: true,
          rolePermissions: { create: driverPerms.map((p) => ({ permissionId: p.id })) },
        },
      });

      const csPerms = allPermissions.filter((p) =>
        (["tenants", "customers", "shipments", "tracking", "notifications"].includes(p.resource) && p.action === "read") || (p.resource === "notifications" && p.action === "update"),
      );
      await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: "Customer Service",
          description: "Customer-facing support staff",
          isSystem: true,
          rolePermissions: { create: csPerms.map((p) => ({ permissionId: p.id })) },
        },
      });

      const finPerms = allPermissions.filter((p) =>
        ["tenants", "customers", "shipments", "invoices", "payments", "reports", "settlements", "notifications"].includes(p.resource),
      );
      await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: "Finance",
          description: "Finance team",
          isSystem: true,
          rolePermissions: { create: finPerms.map((p) => ({ permissionId: p.id })) },
        },
      });

      // Assign the Owner role to the founding user
      await tx.membershipRole.create({
        data: { membershipId: membership.id, roleId: ownerRole.id },
      });

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: user.id,
          action: "tenant.registered",
          targetType: "tenant",
          targetId: tenant.id,
        },
      });

      return { tenant, user, membership };
    });

    return {
      accessToken: this.issueToken(result.user.id),
      tokenType: "Bearer",
      expiresIn: TOKEN_TTL_SECONDS,
      user: { id: result.user.id, fullName: result.user.fullName, email: result.user.email },
      tenant: { id: result.tenant.id, name: result.tenant.name, slug: result.tenant.slug },
    };
  }

  async login(emailInput: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: emailInput.trim().toLowerCase() },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: {
            tenant: { select: { id: true, name: true, slug: true, status: true } },
            membershipRoles: {
              include: { role: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    if (!user || !(await this.verifyPassword(password, user.passwordHash)))
      throw new UnauthorizedException("Invalid email or password");

    // Update last login
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.prisma.auditLog.create({
      data: { actorId: user.id, action: "auth.login", targetType: "user", targetId: user.id },
    });

    return {
      accessToken: this.issueToken(user.id),
      tokenType: "Bearer",
      expiresIn: TOKEN_TTL_SECONDS,
      user: { id: user.id, fullName: user.fullName, email: user.email },
      isPlatformAdmin: user.isPlatformAdmin,
      memberships: user.memberships.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        tenantSlug: m.tenant.slug,
        tenantStatus: m.tenant.status,
        roles: m.membershipRoles.map((mr) => ({ id: mr.role.id, name: mr.role.name })),
      })),
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, fullName: true, phone: true, avatarUrl: true,
        isActive: true, createdAt: true, lastLoginAt: true,
        memberships: {
          where: { status: "ACTIVE" },
          include: {
            tenant: { select: { id: true, name: true, slug: true } },
            membershipRoles: { include: { role: { select: { id: true, name: true, rolePermissions: { include: { permission: { select: { resource: true, action: true } } } } } } } },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException("User not found");
    return user;
  }

  async getTenantContext(userId: string, tenantId?: string, supportSessionId?: string) {
    if (!tenantId || !isUUID(tenantId)) throw new UnauthorizedException("Valid x-tenant-id header required");
    if (supportSessionId) {
      const [supportSession, user] = await Promise.all([
        this.prisma.platformSupportSession.findFirst({
          where: { id: supportSessionId, tenantId, adminUserId: userId, endedAt: null, expiresAt: { gt: new Date() } },
          include: { tenant: { select: { id: true, name: true, slug: true, status: true, timezone: true, currency: true, logo: true } } },
        }),
        this.prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, isPlatformAdmin: true } }),
      ]);
      if (!supportSession || !user?.isActive || !user.isPlatformAdmin)
        throw new UnauthorizedException("This platform support session is invalid, ended, or expired");
      if (supportSession.tenant.status !== "ACTIVE") throw new ForbiddenException("This tenant account is currently suspended");
      return supportSession.tenant;
    }
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: { tenant: { select: { id: true, name: true, status: true, timezone: true, currency: true, logo: true } } },
    });
    if (!membership || membership.status !== "ACTIVE")
      throw new UnauthorizedException("You are not an active member of this tenant");
    if (membership.tenant.status !== "ACTIVE")
      throw new ForbiddenException("This tenant account is currently suspended");
    return membership.tenant;
  }

  // ─── Password Hashing ───────────────────────────────────
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const hash = (await deriveKey(password, salt, ITERATIONS, 32, "sha256")).toString("hex");
    return `${ITERATIONS}:${salt}:${hash}`;
  }

  async verifyPassword(password: string, encoded: string): Promise<boolean> {
    const [iterations, salt, expectedHex] = encoded.split(":");
    if (Number(iterations) !== ITERATIONS || !salt || !expectedHex) return false;
    const actual = await deriveKey(password, salt, ITERATIONS, 32, "sha256");
    const expected = Buffer.from(expectedHex, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  // ─── Token Management ──────────────────────────────────
  issueToken(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = { sub: userId, iat: now, exp: now + TOKEN_TTL_SECONDS };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const input = `v1.${body}`;
    return `${input}.${this.sign(input)}`;
  }

  verifyToken(token: string): TokenPayload {
    const [version, body, signature, extra] = token.split(".");
    if (version !== "v1" || !body || !signature || extra)
      throw new UnauthorizedException("Invalid access token");

    const input = `${version}.${body}`;
    const expected = Buffer.from(this.sign(input));
    const supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
      throw new UnauthorizedException("Invalid access token");

    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
      if (!payload.sub || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000)
        throw new Error("expired");
      return payload;
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }

  private sign(value: string): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32)
      throw new Error("JWT_SECRET must be set to a random value of at least 32 characters");
    return createHmac("sha256", secret).update(value).digest("base64url");
  }
}






