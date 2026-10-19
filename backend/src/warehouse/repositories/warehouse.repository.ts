import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { WarehouseInventoryQueryDto, WarehouseMovementQueryDto } from "../dto/warehouse.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
@Injectable()
export class WarehouseRepository {
  constructor(private readonly prisma: PrismaService) {}
  async list(tenantId: string, query: PaginationDto) {
    const where = { tenantId, isActive: true };
    const [data, total] = await Promise.all([
      this.prisma.warehouse.findMany({ where, orderBy: { name: "asc" }, skip: query.skip, take: query.limit }),
      this.prisma.warehouse.count({ where }),
    ]);
    return { data, total };
  }
  create(tenantId: string, name: string, address: string | null) { return this.prisma.warehouse.create({ data: { tenantId, name, address } }); }
  findActive(tenantId: string, id: string) { return this.prisma.warehouse.findFirst({ where: { tenantId, id, isActive: true }, select: { id: true } }); }
  async inventory(tenantId: string, query: WarehouseInventoryQueryDto) {
    const where: Prisma.InventoryBalanceWhereInput = {
      tenantId,
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.stockFilter === "out" ? { quantity: { equals: new Prisma.Decimal(0) } } : {}),
      ...(query.stockFilter === "low" ? { quantity: { gt: new Prisma.Decimal(0), lte: new Prisma.Decimal(query.lowStockThreshold) } } : {}),
      ...(query.search?.trim() ? { product: { OR: [
        { name: { contains: query.search.trim(), mode: "insensitive" } },
        { sku: { contains: query.search.trim(), mode: "insensitive" } },
        { barcode: { contains: query.search.trim(), mode: "insensitive" } },
      ] } } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.inventoryBalance.findMany({ where, include: { product: { select: { id: true, sku: true, barcode: true, name: true, imageUrl: true, category: { select: { name: true } } } }, warehouse: { select: { id: true, name: true } } }, skip: query.skip, take: query.limit, orderBy: [{ warehouse: { name: "asc" } }, { product: { name: "asc" } }] }),
      this.prisma.inventoryBalance.count({ where }),
    ]);
    return { data, total };
  }
  async movements(tenantId: string, query: WarehouseMovementQueryDto) {
    const needle = query.search?.trim();
    const where: Prisma.StockMovementWhereInput = {
      tenantId,
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.direction === "in" ? { quantityChange: { gt: new Prisma.Decimal(0) } } : {}),
      ...(query.direction === "out" ? { quantityChange: { lt: new Prisma.Decimal(0) } } : {}),
      ...(needle ? { OR: [
        { product: { name: { contains: needle, mode: "insensitive" } } },
        { product: { sku: { contains: needle, mode: "insensitive" } } },
        { reason: { contains: needle, mode: "insensitive" } },
        { warehouse: { name: { contains: needle, mode: "insensitive" } } },
      ] } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({ where, include: { product: { select: { sku: true, name: true, barcode: true } }, warehouse: { select: { name: true } } }, skip: query.skip, take: query.limit, orderBy: { recordedAt: "desc" } }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { data, total };
  }
}
