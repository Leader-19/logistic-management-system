import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, dto: PaginationDto, search?: string) {
    const where: any = { tenantId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({ where, skip: dto.skip, take: dto.limit, orderBy: { name: "asc" } }),
      this.prisma.customer.count({ where }),
    ]);
    return paginate(data, total, dto);
  }

  async findOne(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { shipments: true } } },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  async create(tenantId: string, data: {
    name: string; email?: string; phone?: string; company?: string;
    address?: string; city?: string; state?: string; zipCode?: string;
    country?: string; notes?: string;
  }) {
    return this.prisma.customer.create({ data: { tenantId, ...data } });
  }

  async update(tenantId: string, id: string, data: {
    name?: string; email?: string; phone?: string; company?: string;
    address?: string; city?: string; state?: string; zipCode?: string;
    country?: string; notes?: string; isActive?: boolean;
  }) {
    const customer = await this.prisma.customer.findFirst({ where: { id, tenantId } });
    if (!customer) throw new NotFoundException("Customer not found");
    return this.prisma.customer.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, tenantId } });
    if (!customer) throw new NotFoundException("Customer not found");
    return this.prisma.customer.update({ where: { id }, data: { isActive: false } });
  }
}

