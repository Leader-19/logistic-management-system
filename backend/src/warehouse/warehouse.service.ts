import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";
import { ProductsService } from "../products/products.service";
import { WarehouseRepository } from "./repositories/warehouse.repository";

@Injectable()
export class WarehouseService {
  constructor(private readonly prisma: PrismaService, private readonly products: ProductsService, private readonly repository: WarehouseRepository) {}

  list(tenantId: string) {
    return this.repository.list(tenantId);
  }

  async create(tenantId: string, input: { name: string; address?: string }) {
    try { return await this.repository.create(tenantId, input.name.trim(), input.address?.trim() || null); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BadRequestException("A warehouse with that name already exists");
      throw error;
    }
  }

  async inventory(tenantId: string, pagination: PaginationDto, warehouseId?: string) {
    if (warehouseId && !await this.repository.findActive(tenantId, warehouseId)) throw new NotFoundException("Warehouse not found");
    const result = await this.repository.inventory(tenantId, pagination, warehouseId);
    return paginate(result.data, result.total, pagination);
  }

  async movements(tenantId: string, pagination: PaginationDto, warehouseId?: string) {
    const result = await this.repository.movements(tenantId, pagination, warehouseId);
    return paginate(result.data, result.total, pagination);
  }

  async summary(tenantId: string) {
    const [balances, movements] = await Promise.all([
      this.prisma.inventoryBalance.count({ where: { tenantId } }),
      this.prisma.stockMovement.count({ where: { tenantId } }),
    ]);
    return { balanceRows: balances, movementCount: movements };
  }

  async adjust(tenantId: string, warehouseId: string, actorId: string, input: { productId: string; quantityChange: number; reason: string }) {
    const [warehouse, product] = await Promise.all([
      this.prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId, isActive: true }, select: { id: true } }),
      this.products.getActiveById(tenantId, input.productId),
    ]);
    if (!warehouse) throw new NotFoundException("Warehouse not found");
    const delta = new Prisma.Decimal(input.quantityChange);
    if (delta.isZero()) throw new BadRequestException("Stock adjustment must be non-zero");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const balance = await tx.inventoryBalance.upsert({
          where: { tenantId_warehouseId_productId: { tenantId, warehouseId, productId: product.id } },
          create: { tenantId, warehouseId, productId: product.id, quantity: delta },
          update: { quantity: { increment: delta }, updatedAt: new Date() },
        });
        const movement = await tx.stockMovement.create({ data: { tenantId, warehouseId, productId: product.id, quantityChange: delta, quantityAfter: balance.quantity, reason: input.reason.trim(), actorId } });
        await tx.auditLog.create({ data: { tenantId, actorId, action: "warehouse.stock.adjusted", targetType: "stock_movement", targetId: movement.id, metadata: { warehouseId, productId: product.id, quantityChange: delta.toString(), quantityAfter: balance.quantity.toString(), reason: input.reason.trim() } } });
        return { balance, movement };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2004", "P2010"].includes(error.code)) throw new BadRequestException("This adjustment would make stock negative");
      throw error;
    }
  }
}


