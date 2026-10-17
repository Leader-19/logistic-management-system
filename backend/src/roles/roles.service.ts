import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, dto: PaginationDto) {
    const where = {
      OR: [{ tenantId }, { tenantId: null, isSystem: true }],
    };
    const [data, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        include: {
          rolePermissions: { include: { permission: true } },
          _count: { select: { membershipRoles: true } },
        },
        skip: dto.skip,
        take: dto.limit,
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      }),
      this.prisma.role.count({ where }),
    ]);
    return paginate(data, total, dto);
  }

  async findOne(tenantId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null, isSystem: true }] },
      include: {
        rolePermissions: { include: { permission: true } },
        membershipRoles: {
          include: {
            membership: {
              include: { user: { select: { id: true, fullName: true, email: true } } },
            },
          },
        },
      },
    });
    if (!role) throw new NotFoundException("Role not found");
    return role;
  }

  async create(tenantId: string, data: { name: string; description?: string; permissionIds?: string[] }, actorPermissions: string[]) {
    const existing = await this.prisma.role.findUnique({
      where: { tenantId_name: { tenantId, name: data.name } },
    });
    if (existing) throw new BadRequestException(`A role named "${data.name}" already exists`);

    const permissions = await this.validatePermissions(data.permissionIds ?? [], actorPermissions);
    return this.prisma.role.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description,
        isSystem: false,
        rolePermissions: permissions.length
          ? { create: permissions.map((pid) => ({ permissionId: pid })) }
          : undefined,
      },
      include: { rolePermissions: { include: { permission: true } } },
    });
  }

  async update(tenantId: string, id: string, data: { name?: string; description?: string }) {
    const role = await this.prisma.role.findFirst({ where: { id, tenantId } });
    if (!role) throw new NotFoundException("Role not found");
    if (role.isSystem) throw new ForbiddenException("Cannot edit system roles");

    if (data.name && data.name !== role.name) {
      const dup = await this.prisma.role.findUnique({
        where: { tenantId_name: { tenantId, name: data.name } },
      });
      if (dup) throw new BadRequestException(`A role named "${data.name}" already exists`);
    }

    return this.prisma.role.update({
      where: { id },
      data: { name: data.name, description: data.description },
      include: { rolePermissions: { include: { permission: true } } },
    });
  }

  async remove(tenantId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { membershipRoles: true } } },
    });
    if (!role) throw new NotFoundException("Role not found");
    if (role.isSystem) throw new ForbiddenException("Cannot delete system roles");
    if (role._count.membershipRoles > 0)
      throw new BadRequestException("Cannot delete a role that is assigned to members. Unassign it first.");

    await this.prisma.role.delete({ where: { id } });
    return { message: "Role deleted" };
  }

  async setPermissions(tenantId: string, id: string, permissionIds: string[], actorPermissions: string[]) {
    const role = await this.prisma.role.findFirst({ where: { id, tenantId } });
    if (!role) throw new NotFoundException("Role not found");
    if (role.isSystem) throw new ForbiddenException("Cannot modify system role permissions");

    // Validate all permission IDs exist
    const validatedIds = await this.validatePermissions(permissionIds, actorPermissions);

    // Replace all role permissions in a transaction
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      ...validatedIds.map((pid) =>
        this.prisma.rolePermission.create({ data: { roleId: id, permissionId: pid } }),
      ),
    ]);

    return this.findOne(tenantId, id);
  }

  private async validatePermissions(permissionIds: string[], actorPermissions: string[]): Promise<string[]> {
    const perms = await this.prisma.permission.findMany({ where: { id: { in: permissionIds } }, select: { id: true, resource: true, action: true } });
    if (perms.length !== new Set(permissionIds).size) throw new BadRequestException("One or more permission IDs are invalid");
    const canGrant = (resource: string, action: string) => actorPermissions.includes("*.*") || actorPermissions.includes(`${resource}.*`) || actorPermissions.includes(`${resource}.${action}`) || (action !== "manage" && actorPermissions.includes(`${resource}.manage`));
    const denied = perms.filter(permission => !canGrant(permission.resource, permission.action));
    if (denied.length) throw new ForbiddenException("You cannot grant permissions you do not have");
    return perms.map(permission => permission.id);
  }
}

