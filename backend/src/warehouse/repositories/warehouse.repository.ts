import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { PaginationDto } from "../../common/dto/pagination.dto";
@Injectable()
export class WarehouseRepository {
  constructor(private readonly prisma: PrismaService) {}
  list(tenantId: string) { return this.prisma.warehouse.findMany({ where: { tenantId, isActive: true }, orderBy: { name: "asc" } }); }
  create(tenantId: string, name: string, address: string | null) { return this.prisma.warehouse.create({ data: { tenantId, name, address } }); }
  findActive(tenantId: string, id: string) { return this.prisma.warehouse.findFirst({ where: { tenantId, id, isActive: true }, select: { id: true } }); }
  async inventory(tenantId: string, pagination: PaginationDto, warehouseId?: string) {
    const where = { tenantId, ...(warehouseId ? { warehouseId } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.inventoryBalance.findMany({ where, include: { product: { select: { id: true, sku: true, barcode: true, name: true, imageUrl: true, category: { select: { name: true } } } }, warehouse: { select: { id: true, name: true } } }, skip: pagination.skip, take: pagination.limit, orderBy: [{ warehouse: { name: "asc" } }, { product: { name: "asc" } }] }),
      this.prisma.inventoryBalance.count({ where }),
    ]);
    return { data, total };
  }
  async movements(tenantId: string, pagination: PaginationDto, warehouseId?: string) {
    const where = { tenantId, ...(warehouseId ? { warehouseId } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({ where, include: { product: { select: { sku: true, name: true, barcode: true } }, warehouse: { select: { name: true } } }, skip: pagination.skip, take: pagination.limit, orderBy: { recordedAt: "desc" } }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { data, total };
  }
}
