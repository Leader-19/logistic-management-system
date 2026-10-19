import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TenantStatus } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";
import { TenantsService } from "../tenants/tenants.service";
import { AuthService } from "../auth/auth.service";

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService, private readonly tenantsService: TenantsService, private readonly auth: AuthService) { }

  async createTenant(adminUserId: string, input: { name: string; ownerName: string; ownerEmail: string }) {
    const email = input.ownerEmail.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException("An account with this owner email already exists");
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const passwordHash = await this.auth.hashPassword(randomBytes(24).toString("base64url"));
    const slugBase = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
    const result = await this.prisma.$transaction(async tx => {
      const tenant = await tx.tenant.create({ data: { name: input.name.trim(), slug: `${slugBase}-${randomBytes(3).toString("hex")}` } });
      const user = await tx.user.create({ data: { email, fullName: input.ownerName.trim(), passwordHash } });
      const ownerRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: "Owner",
          description: "Full access to this workspace",
          isSystem: true,
          rolePermissions: { create: (await tx.permission.findMany({ select: { id: true } })).map(permission => ({ permissionId: permission.id })) },
        },
      });
      const membership = await tx.tenantMembership.create({
        data: {
          tenantId: tenant.id, userId: user.id, status: "INVITED", invitationTokenHash: tokenHash,
          invitationExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), invitationRequiresPassword: true,
          membershipRoles: { create: { roleId: ownerRole.id } },
        },
      });
      await tx.auditLog.create({
        data: { tenantId: tenant.id, actorId: adminUserId, action: "platform.tenant.created", targetType: "tenant", targetId: tenant.id, metadata: { slug: tenant.slug, ownerEmail: email } },
      });
      return { tenant, owner: { id: user.id, fullName: user.fullName, email: user.email }, membershipId: membership.id };
    });
    return { ...result, invitationToken: token, invitationRequiresPassword: true };
  }

  async deleteTenant(adminUserId: string, tenantId: string, input: { reason: string; confirmationSlug: string }) {
    const tenant = await this.tenantsService.cancelFromPlatform(tenantId, adminUserId, input.reason, input.confirmationSlug);
    const activeSessions = await this.prisma.platformSupportSession.findMany({
      where: { tenantId, endedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (activeSessions.length) {
      const endedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        for (const session of activeSessions) {
          const result = await tx.platformSupportSession.updateMany({ where: { id: session.id, endedAt: null }, data: { endedAt } });
          if (result.count) {
            await tx.auditLog.create({
              data: {
                tenantId,
                actorId: adminUserId,
                action: "platform.support.ended",
                targetType: "platform_support_session",
                targetId: session.id,
                metadata: { endedAt: endedAt.toISOString(), reason: "tenant cancelled" },
              },
            });
          }
        }
      });
    }
    return tenant;
  }

  async getOverview() {
    const [tenants, activeTenants, suspendedTenants, cancelledTenants, shipments, members, activeSupportSessions, paidSubscriptions, pastDueSubscriptions] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: TenantStatus.ACTIVE } }),
      this.prisma.tenant.count({ where: { status: TenantStatus.SUSPENDED } }),
      this.prisma.tenant.count({ where: { status: TenantStatus.CANCELLED } }),
      this.prisma.shipment.count(),
      this.prisma.tenantMembership.count({ where: { status: "ACTIVE" } }),
      this.prisma.platformSupportSession.count({ where: { endedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.subscription.count({ where: { status: { in: ["ACTIVE", "TRIALING"] } } }),
      this.prisma.subscription.count({ where: { status: "PAST_DUE" } }),
    ]);
    return { tenants, activeTenants, suspendedTenants, cancelledTenants, shipments, members, activeSupportSessions, paidSubscriptions, pastDueSubscriptions };
  }

  async listActivity(pagination: PaginationDto) {
    const where: Prisma.AuditLogWhereInput = {};
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          outcome: true,
          createdAt: true,
          actor: { select: { id: true, fullName: true, email: true } },
          tenant: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  async listTenants(pagination: PaginationDto, search?: string, status?: TenantStatus) {
    if (status && !Object.values(TenantStatus).includes(status)) throw new BadRequestException("Invalid tenant status filter");
    const where: Prisma.TenantWhereInput = {
      ...(status ? { status } : {}),
      ...(search?.trim() ? { OR: [
          { name: { contains: search.trim(), mode: "insensitive" as const } },
          { slug: { contains: search.trim(), mode: "insensitive" as const } },
        ] } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        include: {
          _count: { select: { memberships: true, shipments: true } },
          subscription: { select: { status: true, plan: { select: { id: true, name: true, features: { where: { feature: "max_users" }, select: { value: true } } } } } },
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  async listPlans(pagination: PaginationDto) {
    const [data, total] = await Promise.all([
      this.prisma.plan.findMany({ include: { features: true, _count: { select: { subscriptions: true } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], skip: pagination.skip, take: pagination.limit }),
      this.prisma.plan.count(),
    ]);
    const configuredSeats = Number(process.env.DEFAULT_INCLUDED_USERS ?? 10);
    return { currency: (process.env.STRIPE_CURRENCY ?? "USD").toUpperCase(), defaultIncludedUsers: Number.isSafeInteger(configuredSeats) && configuredSeats > 0 ? configuredSeats : 10, ...paginate(data, total, pagination) };
  }

  async createPlan(adminUserId: string, input: { name: string; description?: string; monthlyPrice: string; yearlyPrice: string; maxUsers: number; isActive?: boolean }) {
    const plan = await this.prisma.$transaction(async tx => {
      const created = await tx.plan.create({
        data: {
          name: input.name.trim(), description: input.description?.trim() || null,
          monthlyPrice: new Prisma.Decimal(input.monthlyPrice), yearlyPrice: new Prisma.Decimal(input.yearlyPrice),
          isActive: input.isActive ?? true,
          features: { create: { feature: "max_users", value: String(input.maxUsers) } },
        },
        include: { features: true, _count: { select: { subscriptions: true } } },
      });
      await tx.auditLog.create({ data: { actorId: adminUserId, action: "platform.plan.created", targetType: "plan", targetId: created.id, metadata: { name: created.name, maxUsers: input.maxUsers } } });
      return created;
    });
    return plan;
  }

  async updatePlan(adminUserId: string, id: string, input: { name: string; description?: string; monthlyPrice: string; yearlyPrice: string; maxUsers: number; isActive?: boolean }) {
    const existing = await this.prisma.plan.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException("Plan not found");
    return this.prisma.$transaction(async tx => {
      const plan = await tx.plan.update({
        where: { id },
        data: {
          name: input.name.trim(), description: input.description?.trim() || null,
          monthlyPrice: new Prisma.Decimal(input.monthlyPrice), yearlyPrice: new Prisma.Decimal(input.yearlyPrice),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          features: { upsert: { where: { planId_feature: { planId: id, feature: "max_users" } }, create: { feature: "max_users", value: String(input.maxUsers) }, update: { value: String(input.maxUsers) } } },
        },
        include: { features: true, _count: { select: { subscriptions: true } } },
      });
      await tx.auditLog.create({ data: { actorId: adminUserId, action: "platform.plan.updated", targetType: "plan", targetId: id, metadata: { name: plan.name, maxUsers: input.maxUsers, isActive: plan.isActive } } });
      return plan;
    });
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ resource: "asc" }, { action: "asc" }] });
  }

  listSessions(adminUserId: string) {
    return this.prisma.platformSupportSession.findMany({
      where: { adminUserId },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
  }

  async startSession(adminUserId: string, input: {
    tenantId: string;
    reason: string;
    durationMinutes: number;
    permissionKeys: string[];
  }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new NotFoundException("Tenant not found");
    if (tenant.status !== TenantStatus.ACTIVE) throw new ForbiddenException("Support sessions can only start for active tenants");
    const permissionKeys = [...new Set(input.permissionKeys)];
    const permissions = await this.prisma.permission.findMany();
    const available = new Set(permissions.map((permission) => `${permission.resource}.${permission.action}`));
    const invalid = permissionKeys.filter((key) => !available.has(key));
    if (invalid.length) throw new ForbiddenException("One or more support permissions are invalid");

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + input.durationMinutes * 60_000);
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.platformSupportSession.create({
        data: {
          adminUserId,
          tenantId: tenant.id,
          reason: input.reason.trim(),
          permissionKeys,
          startedAt,
          expiresAt,
        },
        select: { id: true, tenantId: true, reason: true, permissionKeys: true, startedAt: true, expiresAt: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: adminUserId,
          action: "platform.support.started",
          targetType: "platform_support_session",
          targetId: session.id,
          metadata: { reason: session.reason, permissions: session.permissionKeys, expiresAt: session.expiresAt.toISOString() },
        },
      });
      return session;
    });
  }

  async endSession(adminUserId: string, id: string) {
    const session = await this.prisma.platformSupportSession.findFirst({ where: { id, adminUserId } });
    if (!session) throw new NotFoundException("Support session not found");
    if (!session.endedAt) {
      const endedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.platformSupportSession.update({ where: { id }, data: { endedAt } }),
        this.prisma.auditLog.create({
          data: {
            tenantId: session.tenantId,
            actorId: adminUserId,
            action: "platform.support.ended",
            targetType: "platform_support_session",
            targetId: session.id,
            metadata: { endedAt: endedAt.toISOString() },
          },
        }),
      ]);
    }
    return { message: "Support session ended" };
  }
}
