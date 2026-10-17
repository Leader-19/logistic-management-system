import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { PaginationDto } from "../../common/dto/pagination.dto";

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) { }
  async list(tenantId: string, pagination: PaginationDto, search?: string) {
    const where: Prisma.ProductWhereInput = { tenantId, isActive: true };
    if (search?.trim()) where.OR = [
      { sku: { contains: search.trim(), mode: "insensitive" } },
      { barcode: { contains: search.trim(), mode: "insensitive" } },
      { name: { contains: search.trim(), mode: "insensitive" } },
    ];
    const [data, total] = await Promise.all([
      this.prisma.product.findMany({ where, include: { category: { select: { id: true, name: true } } }, skip: pagination.skip, take: pagination.limit, orderBy: { name: "asc" } }),
      this.prisma.product.count({ where }),
    ]);
    return { data, total };
  }
  listCategories(tenantId: string) { return this.prisma.productCategory.findMany({ where: { tenantId }, orderBy: { name: "asc" } }); }
  createCategory(tenantId: string, name: string) { return this.prisma.productCategory.create({ data: { tenantId, name } }); }
  findCategory(tenantId: string, name: string) { return this.prisma.productCategory.findUnique({ where: { tenantId_name: { tenantId, name } } }); }
  create(tenantId: string, data: Prisma.ProductUncheckedCreateInput) { return this.prisma.product.create({ data, include: { category: true } }); }
  findTenantProduct(tenantId: string, id: string) { return this.prisma.product.findFirst({ where: { tenantId, id } }); }
  update(id: string, data: Prisma.ProductUncheckedUpdateInput) { return this.prisma.product.update({ where: { id }, data, include: { category: true } }); }
  findActiveByBarcode(tenantId: string, barcode: string) { return this.prisma.product.findFirst({ where: { tenantId, barcode, isActive: true }, include: { category: { select: { name: true } } } }); }
  findActiveById(tenantId: string, id: string) { return this.prisma.product.findFirst({ where: { tenantId, id, isActive: true }, select: { id: true } }); }
  findImage(tenantId: string, id: string) { return this.prisma.product.findFirst({ where: { tenantId, id }, select: { imageUrl: true } }); }
  saveImage(id: string, imageUrl: string) { return this.prisma.product.update({ where: { id }, data: { imageUrl }, include: { category: true } }); }
}


