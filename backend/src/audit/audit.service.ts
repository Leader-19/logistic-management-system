import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, dto: PaginationDto, filters?: {
    action?: string; targetType?: string; actorId?: string;
  }) {
    const where: any = { tenantId };
    if (filters?.action) where.action = { contains: filters.action };
    if (filters?.targetType) where.targetType = filters.targetType;
    if (filters?.actorId) where.actorId = filters.actorId;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, fullName: true, email: true } } },
        skip: dto.skip,
        take: dto.limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(data, total, dto);
  }
}

