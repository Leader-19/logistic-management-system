import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, dto: PaginationDto) {
    const where = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        skip: dto.skip,
        take: dto.limit,
        orderBy: { name: "asc" },
      }),
      this.prisma.branch.count({ where }),
    ]);
    return paginate(data, total, dto);
  }

  async findOne(tenantId: string, id: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id, tenantId } });
    if (!branch) throw new NotFoundException("Branch not found");
    return branch;
  }

  async create(tenantId: string, data: {
    name: string; code?: string; address?: string; phone?: string; email?: string;
  }) {
    const dup = await this.prisma.branch.findUnique({
      where: { tenantId_name: { tenantId, name: data.name } },
    });
    if (dup) throw new BadRequestException(`A branch named "${data.name}" already exists`);

    return this.prisma.branch.create({
      data: { tenantId, ...data },
    });
  }

  async update(tenantId: string, id: string, data: {
    name?: string; code?: string; address?: string; phone?: string; email?: string; isActive?: boolean;
  }) {
    const branch = await this.prisma.branch.findFirst({ where: { id, tenantId } });
    if (!branch) throw new NotFoundException("Branch not found");

    if (data.name && data.name !== branch.name) {
      const dup = await this.prisma.branch.findUnique({
        where: { tenantId_name: { tenantId, name: data.name } },
      });
      if (dup) throw new BadRequestException(`A branch named "${data.name}" already exists`);
    }

    return this.prisma.branch.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id, tenantId } });
    if (!branch) throw new NotFoundException("Branch not found");
    return this.prisma.branch.update({ where: { id }, data: { isActive: false } });
  }
}

