import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TenantStatus } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";
import { TenantsService } from "../tenants/tenants.service";

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService, private readonly tenantsService: TenantsService) { }

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
    const [tenants, activeTenants, suspendedTenants, cancelledTenants, shipments, members, activeSupportSessions] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: TenantStatus.ACTIVE } }),
      this.prisma.tenant.count({ where: { status: TenantStatus.SUSPENDED } }),
      this.prisma.tenant.count({ where: { status: TenantStatus.CANCELLED } }),
      this.prisma.shipment.count(),
      this.prisma.tenantMembership.count({ where: { status: "ACTIVE" } }),
      this.prisma.platformSupportSession.count({ where: { endedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    return { tenants, activeTenants, suspendedTenants, cancelledTenants, shipments, members, activeSupportSessions };
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
        include: { _count: { select: { memberships: true, shipments: true } } },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return paginate(data, total, pagination);
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
