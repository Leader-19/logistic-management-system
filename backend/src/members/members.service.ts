import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";
import { AuthService } from "../auth/auth.service";
import { createHash, randomBytes } from "node:crypto";

function stripInvitationSecrets<T extends object>(membership: T) {
  const { invitationTokenHash: _tokenHash, invitationExpiresAt: _expiresAt, invitationRequiresPassword: _requiresPassword, ...safe } = membership as T & {
    invitationTokenHash?: string | null;
    invitationExpiresAt?: Date | null;
    invitationRequiresPassword?: boolean;
  };
  return safe;
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async findAll(tenantId: string, dto: PaginationDto, search?: string) {
    const where: any = { tenantId };
    if (search) {
      where.user = {
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.tenantMembership.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true, isActive: true } },
          branch: { select: { id: true, name: true } },
          membershipRoles: {
            include: { role: { select: { id: true, name: true } } },
          },
        },
        skip: dto.skip,
        take: dto.limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.tenantMembership.count({ where }),
    ]);
    return paginate(data.map(stripInvitationSecrets), total, dto);
  }

  async findOne(tenantId: string, id: string) {
    const member = await this.prisma.tenantMembership.findFirst({
      where: { id, tenantId },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true, isActive: true, createdAt: true } },
        branch: true,
        membershipRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (!member) throw new NotFoundException("Member not found");
    return stripInvitationSecrets(member);
  }

  async invite(tenantId: string, actorId: string, data: {
    email: string; fullName: string; roleIds: string[]; branchId?: string;
  }, actorPermissions: string[]) {
    const email = data.email.trim().toLowerCase();

    // Check if already a member
    let user = await this.prisma.user.findUnique({ where: { email } });
    const existingMembership = user
      ? await this.prisma.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId, userId: user.id } },
        })
      : null;
    if (existingMembership) throw new BadRequestException("This user is already a member of this tenant");

    // Validate roleIds belong to this tenant
    await this.validateRoles(tenantId, data.roleIds, actorPermissions);

    // Validate branchId
    if (data.branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: data.branchId, tenantId } });
      if (!branch) throw new BadRequestException("Branch not found");
    }

    const invitationToken = randomBytes(32).toString("base64url");
    const invitationTokenHash = createHash("sha256").update(invitationToken).digest("hex");
    const invitationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const invitationRequiresPassword = !user;
    const membership = await this.prisma.$transaction(async (tx) => {
      await this.assertSeatCapacity(tx, tenantId, 1);
      // Create user if doesn't exist
      if (!user) {
        const tempPassword = randomBytes(16).toString("hex");
        const passwordHash = await this.auth.hashPassword(tempPassword);
        user = await tx.user.create({
          data: { email, fullName: data.fullName.trim(), passwordHash },
        });
      }

      const membership = await tx.tenantMembership.create({
        data: {
          tenantId,
          userId: user.id,
          status: "INVITED",
          branchId: data.branchId,
          invitationTokenHash,
          invitationExpiresAt,
          invitationRequiresPassword,
          membershipRoles: {
            create: data.roleIds.map((roleId) => ({ roleId })),
          },
        },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          membershipRoles: { include: { role: { select: { id: true, name: true } } } },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          action: "members.invited",
          targetType: "tenant_membership",
          targetId: membership.id,
        },
      });

      return membership;
    });
    return { membership: stripInvitationSecrets(membership), invitationToken, invitationRequiresPassword };
  }

  async createAccount(tenantId: string, actorId: string, data: {
    email: string; fullName: string; password: string; roleIds: string[]; branchId?: string;
  }, actorPermissions: string[]) {
    const result = await this.createAccounts(tenantId, actorId, [data], data.roleIds, data.branchId, actorPermissions);
    return result.members[0];
  }

  async createBatch(tenantId: string, actorId: string, data: {
    users: Array<{ email: string; fullName: string; password: string }>;
    roleIds: string[];
    branchId?: string;
  }, actorPermissions: string[]) {
    return this.createAccounts(tenantId, actorId, data.users, data.roleIds, data.branchId, actorPermissions);
  }

  private async createAccounts(
    tenantId: string,
    actorId: string,
    inputs: Array<{ email: string; fullName: string; password: string }>,
    roleIds: string[],
    branchId: string | undefined,
    actorPermissions: string[],
  ) {
    if (new Set(roleIds).size !== roleIds.length) throw new BadRequestException("Duplicate role IDs are not allowed");
    await this.validateRoles(tenantId, roleIds, actorPermissions);
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } });
      if (!branch) throw new BadRequestException("Branch not found in this company");
    }

    const users = inputs.map((input) => ({ ...input, email: input.email.trim().toLowerCase(), fullName: input.fullName.trim() }));
    if (new Set(users.map((user) => user.email)).size !== users.length) throw new BadRequestException("The CSV contains duplicate email addresses");
    const existingUsers = await this.prisma.user.findMany({ where: { email: { in: users.map((user) => user.email) } }, select: { email: true } });
    if (existingUsers.length) throw new BadRequestException(`Email already belongs to an account: ${existingUsers[0].email}`);
    const prepared = await Promise.all(users.map(async (user) => ({ ...user, passwordHash: await this.auth.hashPassword(user.password) })));

    const members = await this.prisma.$transaction(async (tx) => {
      await this.assertSeatCapacity(tx, tenantId, prepared.length);
      const created: object[] = [];
      for (const user of prepared) {
        const account = await tx.user.create({
          data: { email: user.email, fullName: user.fullName, passwordHash: user.passwordHash },
          select: { id: true, email: true, fullName: true },
        });
        const membership = await tx.tenantMembership.create({
          data: {
            tenantId, userId: account.id, status: "ACTIVE", branchId,
            membershipRoles: { create: roleIds.map((roleId) => ({ roleId })) },
          },
          include: { user: { select: { id: true, email: true, fullName: true } }, membershipRoles: { include: { role: { select: { id: true, name: true } } } } },
        });
        await tx.auditLog.create({ data: { tenantId, actorId, action: "members.created", targetType: "tenant_membership", targetId: membership.id } });
        created.push(stripInvitationSecrets(membership));
      }
      return created;
    });
    return { createdCount: members.length, members };
  }

  private async assertSeatCapacity(tx: Prisma.TransactionClient, tenantId: string, requested: number) {
    await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
    const [used, subscription] = await Promise.all([
      tx.tenantMembership.count({ where: { tenantId, status: { in: ["ACTIVE", "INVITED"] } } }),
      tx.subscription.findUnique({ where: { tenantId }, select: { status: true, plan: { select: { features: { where: { feature: "max_users" }, select: { value: true } } } } } }),
    ]);
    const configuredDefault = Number(process.env.DEFAULT_INCLUDED_USERS ?? 10);
    const fallbackLimit = Number.isSafeInteger(configuredDefault) && configuredDefault > 0 ? configuredDefault : 10;
    const featureValue = Number(subscription?.plan.features[0]?.value);
    const paidPlanActive = subscription && ["ACTIVE", "TRIALING"].includes(subscription.status);
    const limit = paidPlanActive && Number.isSafeInteger(featureValue) && featureValue > 0 ? featureValue : fallbackLimit;
    if (used + requested > limit) {
      throw new HttpException(`This workspace has ${used} of ${limit} user seats in use. Choose a higher plan in Billing & plan before adding more users.`, 402);
    }
  }

  private async validateRoles(tenantId: string, roleIds: string[], actorPermissions: string[]) {
    if (!roleIds.length) throw new BadRequestException("Assign at least one role");
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, OR: [{ tenantId }, { tenantId: null, isSystem: true }] },
      include: { rolePermissions: { include: { permission: { select: { resource: true, action: true } } } } },
    });
    if (roles.length !== new Set(roleIds).size) throw new BadRequestException("One or more role IDs are invalid");
    const canGrant = (resource: string, action: string) => actorPermissions.includes("*.*") || actorPermissions.includes(`${resource}.*`) || actorPermissions.includes(`${resource}.${action}`) || (action !== "manage" && actorPermissions.includes(`${resource}.manage`));
    const deniedRole = roles.find(role => role.rolePermissions.some(({ permission }) => !canGrant(permission.resource, permission.action)));
    if (deniedRole) throw new ForbiddenException(`You cannot assign role "${deniedRole.name}" because it grants permissions you do not have`);
    return roles;
  }

  async acceptInvitation(token: string, password?: string) {
    const invitationTokenHash = createHash("sha256").update(token).digest("hex");
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { invitationTokenHash, status: "INVITED", invitationExpiresAt: { gt: new Date() } },
      select: { id: true, userId: true, tenantId: true, invitationRequiresPassword: true },
    });
    if (!membership) throw new BadRequestException("This invitation is invalid or expired");
    if (membership.invitationRequiresPassword && !password) throw new BadRequestException("Choose a password to accept this invitation");
    const passwordHash = membership.invitationRequiresPassword && password ? await this.auth.hashPassword(password) : undefined;
    await this.prisma.$transaction(async (tx) => {
      if (passwordHash) await tx.user.update({ where: { id: membership.userId }, data: { passwordHash } });
      await tx.tenantMembership.update({
        where: { id: membership.id },
        data: { status: "ACTIVE", invitationTokenHash: null, invitationExpiresAt: null, invitationRequiresPassword: false },
      });
      await tx.auditLog.create({
        data: {
          tenantId: membership.tenantId,
          actorId: membership.userId,
          action: "members.invitation.accepted",
          targetType: "tenant_membership",
          targetId: membership.id,
        },
      });
    });
    return { message: "Invitation accepted. You can now sign in." };
  }

  async update(tenantId: string, id: string, data: { status?: string; branchId?: string | null }) {
    const member = await this.prisma.tenantMembership.findFirst({ where: { id, tenantId } });
    if (!member) throw new NotFoundException("Member not found");

    const updateData: any = {};
    if (data.status) updateData.status = data.status;
    if (data.branchId !== undefined) updateData.branchId = data.branchId;

    const membership = await this.prisma.$transaction(async tx => {
      if (["ACTIVE", "INVITED"].includes(data.status ?? "") && !["ACTIVE", "INVITED"].includes(member.status)) await this.assertSeatCapacity(tx, tenantId, 1);
      return tx.tenantMembership.update({
        where: { id },
        data: updateData,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          membershipRoles: { include: { role: { select: { id: true, name: true } } } },
        },
      });
    });
    return stripInvitationSecrets(membership);
  }

  async assignRoles(tenantId: string, id: string, roleIds: string[], actorPermissions: string[]) {
    const member = await this.prisma.tenantMembership.findFirst({ where: { id, tenantId } });
    if (!member) throw new NotFoundException("Member not found");

    // Validate roleIds
    await this.validateRoles(tenantId, roleIds, actorPermissions);

    // Replace all roles in a transaction
    await this.prisma.$transaction([
      this.prisma.membershipRole.deleteMany({ where: { membershipId: id } }),
      ...roleIds.map((roleId) =>
        this.prisma.membershipRole.create({ data: { membershipId: id, roleId } }),
      ),
    ]);

    return this.findOne(tenantId, id);
  }

  async deactivate(tenantId: string, id: string, currentUserId: string) {
    const member = await this.prisma.tenantMembership.findFirst({
      where: { id, tenantId },
      include: { membershipRoles: { include: { role: true } } },
    });
    if (!member) throw new NotFoundException("Member not found");
    if (member.userId === currentUserId) throw new ForbiddenException("Cannot deactivate yourself");

    // Check if this is the last owner
    const ownerRole = member.membershipRoles.find((mr) => mr.role.name === "Owner");
    if (ownerRole) {
      const otherOwners = await this.prisma.membershipRole.count({
        where: {
          role: { name: "Owner", tenantId },
          membership: { tenantId, status: "ACTIVE" },
          membershipId: { not: id },
        },
      });
      if (otherOwners === 0) throw new ForbiddenException("Cannot deactivate the last owner");
    }

    const membership = await this.prisma.tenantMembership.update({
      where: { id },
      data: { status: "INACTIVE" },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        membershipRoles: { include: { role: { select: { id: true, name: true } } } },
      },
    });
    return stripInvitationSecrets(membership);
  }

  async bulkDeactivate(tenantId: string, ids: string[], currentUserId: string) {
    let deactivatedCount = 0;
    const skipped: string[] = [];
    for (const id of ids) {
      try {
        const member = await this.deactivate(tenantId, id, currentUserId);
        await this.prisma.auditLog.create({ data: { tenantId, actorId: currentUserId, action: "members.deactivated", targetType: "tenant_membership", targetId: id, metadata: { source: "bulk_action" } } });
        if (member.status === "INACTIVE") deactivatedCount += 1;
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        // Keep processing; self-deactivation, last-owner, and unknown IDs stay protected.
        skipped.push(id);
      }
    }
    return { deactivatedCount, skippedCount: skipped.length, skipped };
  }
}

