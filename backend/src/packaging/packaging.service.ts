import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";

@Injectable()
export class PackagingService {
  constructor(private readonly prisma: PrismaService) { }

  async listTypes(tenantId: string, query: PaginationDto) {
    const where = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.packageType.findMany({ where, orderBy: [{ isActive: "desc" }, { name: "asc" }], skip: query.skip, take: query.limit }),
      this.prisma.packageType.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  async createType(tenantId: string, actorId: string, input: {
    code: string; name: string; lengthCm: number; widthCm: number; heightCm: number;
    tareWeightGrams?: number; maxLoadGrams: number; stackable?: boolean;
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const type = await tx.packageType.create({
          data: {
            tenantId,
            code: input.code.trim().toUpperCase(),
            name: input.name.trim(),
            lengthCm: new Prisma.Decimal(input.lengthCm),
            widthCm: new Prisma.Decimal(input.widthCm),
            heightCm: new Prisma.Decimal(input.heightCm),
            tareWeightGrams: input.tareWeightGrams ?? 0,
            maxLoadGrams: input.maxLoadGrams,
            stackable: input.stackable ?? true,
          }
        });
        await tx.auditLog.create({
          data: {
            tenantId, actorId, action: "packaging.type.created", targetType: "package_type", targetId: type.id,
            metadata: { code: type.code, name: type.name },
          }
        });
        return type;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("A package type with that code already exists in this workspace");
      throw error;
    }
  }

  async setTypeActive(tenantId: string, actorId: string, id: string, isActive: boolean) {
    const type = await this.prisma.packageType.findFirst({ where: { id, tenantId }, select: { id: true, code: true, isActive: true } });
    if (!type) throw new NotFoundException("Package type not found");
    if (type.isActive === isActive) return type;
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.packageType.updateMany({ where: { id, tenantId, isActive: type.isActive }, data: { isActive } });
      if (!changed.count) throw new BadRequestException("Package type changed; refresh and try again");
      await tx.auditLog.create({
        data: {
          tenantId, actorId, action: isActive ? "packaging.type.activated" : "packaging.type.deactivated",
          targetType: "package_type", targetId: id, metadata: { code: type.code },
        }
      });
      return tx.packageType.findFirstOrThrow({ where: { id, tenantId } });
    });
  }
}
