import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ShipmentStatus } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";
import { ShipmentsService } from "../shipments/shipments.service";

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService, private readonly shipments: ShipmentsService) {}

  async findAll(tenantId: string, pagination: PaginationDto) {
    const where = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: { shipment: { select: { trackingNumber: true, recipientName: true, customer: { select: { name: true } } } }, lines: true },
        orderBy: { issuedAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  async summary(tenantId: string) {
    const [count, byCurrency] = await Promise.all([
      this.prisma.invoice.count({ where: { tenantId } }),
      this.prisma.invoice.groupBy({ by: ["currency"], where: { tenantId }, _sum: { total: true } }),
    ]);
    return { count, totalsByCurrency: byCurrency.map(item => ({ currency: item.currency, total: item._sum.total?.toString() ?? "0" })) };
  }

  async findOne(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { tenantId, id: invoiceId },
      include: { shipment: { select: { trackingNumber: true, recipientName: true, recipientAddress: true, customer: { select: { name: true } } } }, lines: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }

  async createFromShipment(tenantId: string, shipmentId: string, actorId: string) {
    const source = await this.shipments.getInvoiceSource(tenantId, shipmentId);
    const existing = await this.prisma.invoice.findFirst({ where: { tenantId, shipmentId } });
    if (existing) return this.findOne(tenantId, existing.id);
    if (source.status !== ShipmentStatus.DELIVERED) {
      throw new BadRequestException("Only delivered shipments can be invoiced");
    }

    const setting = await this.prisma.tenantSetting.findUnique({ where: { tenantId_key: { tenantId, key: "invoice.vatRate" } } });
    const taxRateText = setting?.value ?? "10";
    if (!/^(?:100|\d{1,2})(?:\.\d{1,4})?$/.test(taxRateText)) {
      throw new BadRequestException("VAT rate setting must be a number from 0 to 100");
    }
    const subtotal = new Prisma.Decimal(source.chargeAmount).toDecimalPlaces(4);
    const taxRate = new Prisma.Decimal(taxRateText);
    const taxAmount = subtotal.mul(taxRate).div(100).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    const total = subtotal.add(taxAmount).toDecimalPlaces(4);

    try {
      const invoice = await this.prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            tenantId,
            shipmentId,
            invoiceNumber: `INV-${source.trackingNumber}`,
            subtotal,
            taxRate,
            taxAmount,
            total,
            currency: source.currency,
            lines: { create: { description: `Delivery service — ${source.trackingNumber}`, quantity: 1, unitPrice: subtotal, lineTotal: subtotal } },
          },
        });
        await tx.auditLog.create({ data: { tenantId, actorId, action: "invoice.issued", targetType: "invoice", targetId: created.id, metadata: { shipmentId, invoiceNumber: created.invoiceNumber, currency: source.currency } } });
        return created;
      });
      return this.findOne(tenantId, invoice.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const invoice = await this.prisma.invoice.findFirst({ where: { tenantId, shipmentId } });
        if (invoice) return this.findOne(tenantId, invoice.id);
        throw new ConflictException("Invoice number already exists");
      }
      throw error;
    }
  }
}
