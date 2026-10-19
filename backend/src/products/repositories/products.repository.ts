import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { PaginationDto } from "../../common/dto/pagination.dto";

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) { }
  async list(tenantId: string, pagination: PaginationDto, search?: string, status: "active" | "inactive" | "all" = "active", categoryIds?: string[]) {
    const where: Prisma.ProductWhereInput = { tenantId, ...(status === "all" ? {} : { isActive: status === "active" }), ...(categoryIds?.length ? { categoryId: { in: categoryIds } } : {}) };
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
  async listCategories(tenantId: string, pagination: PaginationDto, search?: string) {
    const where: Prisma.ProductCategoryWhereInput = { tenantId, ...(search?.trim() ? { name: { contains: search.trim(), mode: "insensitive" } } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.productCategory.findMany({ where, include: { _count: { select: { products: true } } }, skip: pagination.skip, take: pagination.limit, orderBy: { name: "asc" } }),
      this.prisma.productCategory.count({ where }),
    ]);
    return { data, total };
  }
  createCategory(tenantId: string, name: string) { return this.prisma.productCategory.create({ data: { tenantId, name } }); }
  findTenantCategory(tenantId: string, id: string) { return this.prisma.productCategory.findUnique({ where: { tenantId_id: { tenantId, id } }, include: { _count: { select: { products: true } } } }); }
  updateCategory(tenantId: string, id: string, name: string) { return this.prisma.productCategory.update({ where: { tenantId_id: { tenantId, id } }, data: { name } }); }
  deleteCategory(tenantId: string, id: string) { return this.prisma.productCategory.delete({ where: { tenantId_id: { tenantId, id } } }); }
  findCategory(tenantId: string, name: string) { return this.prisma.productCategory.findUnique({ where: { tenantId_name: { tenantId, name } } }); }
  create(tenantId: string, data: Prisma.ProductUncheckedCreateInput) { return this.prisma.product.create({ data, include: { category: true } }); }
  findTenantProduct(tenantId: string, id: string) { return this.prisma.product.findFirst({ where: { tenantId, id } }); }
  update(tenantId: string, id: string, data: Prisma.ProductUncheckedUpdateInput) { return this.prisma.product.update({ where: { tenantId_id: { tenantId, id } }, data, include: { category: true } }); }
  findActiveByBarcode(tenantId: string, barcode: string) { return this.prisma.product.findFirst({ where: { tenantId, barcode, isActive: true }, include: { category: { select: { name: true } } } }); }
  findActiveById(tenantId: string, id: string) { return this.prisma.product.findFirst({ where: { tenantId, id, isActive: true }, select: { id: true } }); }
  findImage(tenantId: string, id: string) { return this.prisma.product.findFirst({ where: { tenantId, id }, select: { imageUrl: true } }); }
  saveImage(id: string, imageUrl: string) { return this.prisma.product.update({ where: { id }, data: { imageUrl }, include: { category: true } }); }
}


