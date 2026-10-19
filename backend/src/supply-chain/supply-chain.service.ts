import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PurchaseOrderStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";
import { CreatePurchaseOrderDto, PurchaseOrderListQueryDto, ReceivePurchaseOrderDto, SupplierDto } from "./dto/supply-chain.dto";

@Injectable()
export class SupplyChainService {
  constructor(private readonly prisma: PrismaService) {}

  async listSuppliers(tenantId: string, query: PaginationDto, search?: string) {
    const where: Prisma.SupplierWhereInput = {
      tenantId,
      ...(search?.trim() ? { OR: [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { email: { contains: search.trim(), mode: "insensitive" } },
        { phone: { contains: search.trim(), mode: "insensitive" } },
      ] } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({ where, include: { _count: { select: { purchaseOrders: true } } }, orderBy: { name: "asc" }, skip: query.skip, take: query.limit }),
      this.prisma.supplier.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  async createSupplier(tenantId: string, actorId: string, input: SupplierDto) {
    try {
      return await this.prisma.$transaction(async tx => {
        const supplier = await tx.supplier.create({ data: { tenantId, name: input.name.trim(), email: input.email?.trim().toLowerCase() || null, phone: input.phone?.trim() || null, address: input.address?.trim() || null, notes: input.notes?.trim() || null } });
        await tx.auditLog.create({ data: { tenantId, actorId, action: "supply_chain.supplier.created", targetType: "supplier", targetId: supplier.id, metadata: { name: supplier.name } } });
        return supplier;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("A supplier with that name already exists");
      throw error;
    }
  }

  async listPurchaseOrders(tenantId: string, query: PurchaseOrderListQueryDto) {
    const where: Prisma.PurchaseOrderWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search?.trim() ? { OR: [
        { orderNumber: { contains: query.search.trim(), mode: "insensitive" } },
        { supplier: { name: { contains: query.search.trim(), mode: "insensitive" } } },
        { warehouse: { name: { contains: query.search.trim(), mode: "insensitive" } } },
      ] } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({ where, include: { supplier: { select: { id: true, name: true } }, warehouse: { select: { id: true, name: true } }, lines: { include: { product: { select: { id: true, sku: true, name: true } } }, orderBy: { createdAt: "asc" } }, _count: { select: { receipts: true } } }, orderBy: { createdAt: "desc" }, skip: query.skip, take: query.limit }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  async createPurchaseOrder(tenantId: string, actorId: string, input: CreatePurchaseOrderDto) {
    if (!input.lines.length) throw new BadRequestException("Add at least one product to the purchase order");
    if (new Set(input.lines.map(line => line.productId)).size !== input.lines.length) throw new BadRequestException("Each product can only appear once on a purchase order");
    const [supplier, warehouse, products, tenant] = await Promise.all([
      this.prisma.supplier.findFirst({ where: { tenantId, id: input.supplierId, isActive: true }, select: { id: true } }),
      this.prisma.warehouse.findFirst({ where: { tenantId, id: input.warehouseId, isActive: true }, select: { id: true } }),
      this.prisma.product.findMany({ where: { tenantId, id: { in: input.lines.map(line => line.productId) }, isActive: true }, select: { id: true } }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }),
    ]);
    if (!supplier) throw new BadRequestException("Choose an active supplier in this workspace");
    if (!warehouse) throw new BadRequestException("Choose an active warehouse in this workspace");
    if (products.length !== input.lines.length) throw new BadRequestException("One or more products are unavailable in this workspace");
    if (!tenant) throw new NotFoundException("Workspace not found");
    const dateCode = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const orderNumber = `PO-${dateCode}-${randomBytes(3).toString("hex").toUpperCase()}`;
    return this.prisma.$transaction(async tx => {
      const order = await tx.purchaseOrder.create({
        data: {
          tenantId, supplierId: supplier.id, warehouseId: warehouse.id, orderNumber, currency: tenant.currency,
          createdBy: actorId, expectedAt: input.expectedAt ? new Date(input.expectedAt) : null, notes: input.notes?.trim() || null,
          lines: { create: input.lines.map(line => ({ tenantId, productId: line.productId, quantity: new Prisma.Decimal(line.quantity), unitCost: new Prisma.Decimal(line.unitCost) })) },
        },
        include: { supplier: { select: { id: true, name: true } }, warehouse: { select: { id: true, name: true } }, lines: { include: { product: { select: { id: true, sku: true, name: true } } } } },
      });
      await tx.auditLog.create({ data: { tenantId, actorId, action: "supply_chain.purchase_order.created", targetType: "purchase_order", targetId: order.id, metadata: { orderNumber, lineCount: order.lines.length } } });
      return order;
    });
  }

  async issuePurchaseOrder(tenantId: string, actorId: string, id: string) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM purchase_orders WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const order = await tx.purchaseOrder.findFirst({ where: { tenantId, id }, select: { id: true, orderNumber: true, status: true, lines: { select: { id: true } } } });
      if (!order) throw new NotFoundException("Purchase order not found");
      if (order.status !== PurchaseOrderStatus.DRAFT) throw new ConflictException("Only draft purchase orders can be issued");
      if (!order.lines.length) throw new ConflictException("A purchase order needs at least one line before it can be issued");
      const issued = await tx.purchaseOrder.update({ where: { id }, data: { status: PurchaseOrderStatus.ORDERED, orderedAt: new Date() } });
      await tx.auditLog.create({ data: { tenantId, actorId, action: "supply_chain.purchase_order.issued", targetType: "purchase_order", targetId: id, metadata: { orderNumber: order.orderNumber } } });
      return issued;
    });
  }

  async receivePurchaseOrder(tenantId: string, actorId: string, id: string, input: ReceivePurchaseOrderDto) {
    if (!input.lines.length) throw new BadRequestException("Enter at least one received quantity");
    if (new Set(input.lines.map(line => line.lineId)).size !== input.lines.length) throw new BadRequestException("Duplicate purchase order lines are not allowed");
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM purchase_orders WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const order = await tx.purchaseOrder.findFirst({ where: { tenantId, id }, include: { lines: true } });
      if (!order) throw new NotFoundException("Purchase order not found");
      if (order.status !== PurchaseOrderStatus.ORDERED && order.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED) throw new ConflictException("Only issued purchase orders can receive stock");
      const requested = input.lines.map(line => ({ lineId: line.lineId, quantity: new Prisma.Decimal(line.quantity) }));
      if (requested.some(line => line.quantity.lte(0))) throw new BadRequestException("Received quantities must be greater than zero");
      const orderLines = new Map(order.lines.map(line => [line.id, line]));
      for (const line of requested) {
        const existing = orderLines.get(line.lineId);
        if (!existing) throw new BadRequestException("A received item does not belong to this purchase order");
        if (line.quantity.gt(existing.quantity.sub(existing.receivedQuantity))) throw new ConflictException(`Received quantity exceeds the remaining quantity for product ${existing.productId}`);
      }
      const receiptNumber = `GRN-${order.orderNumber}-${randomBytes(2).toString("hex").toUpperCase()}`;
      const receipt = await tx.purchaseReceipt.create({ data: { tenantId, purchaseOrderId: order.id, warehouseId: order.warehouseId, receiptNumber, receivedBy: actorId, notes: input.notes?.trim() || null } });
      for (const line of requested) {
        const orderLine = orderLines.get(line.lineId)!;
        const balance = await tx.inventoryBalance.upsert({
          where: { tenantId_warehouseId_productId: { tenantId, warehouseId: order.warehouseId, productId: orderLine.productId } },
          create: { tenantId, warehouseId: order.warehouseId, productId: orderLine.productId, quantity: line.quantity },
          update: { quantity: { increment: line.quantity } },
        });
        await tx.purchaseReceiptLine.create({ data: { tenantId, receiptId: receipt.id, purchaseOrderLineId: orderLine.id, productId: orderLine.productId, quantity: line.quantity } });
        await tx.purchaseOrderLine.update({ where: { id: orderLine.id }, data: { receivedQuantity: { increment: line.quantity } } });
        await tx.stockMovement.create({ data: { tenantId, warehouseId: order.warehouseId, productId: orderLine.productId, quantityChange: line.quantity, quantityAfter: balance.quantity, reason: `Purchase receipt ${receiptNumber}`, actorId } });
      }
      const updatedLines = await tx.purchaseOrderLine.findMany({ where: { tenantId, purchaseOrderId: order.id }, select: { quantity: true, receivedQuantity: true } });
      const allReceived = updatedLines.every(line => line.receivedQuantity.gte(line.quantity));
      const status = allReceived ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED;
      await tx.purchaseOrder.update({ where: { id: order.id }, data: { status, ...(allReceived ? { receivedAt: new Date() } : {}) } });
      await tx.auditLog.create({ data: { tenantId, actorId, action: "supply_chain.purchase_order.received", targetType: "purchase_receipt", targetId: receipt.id, metadata: { orderNumber: order.orderNumber, receiptNumber, lineCount: requested.length, status } } });
      return { receipt, status };
    });
  }
}
