import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ShipmentStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";
import { ShipmentsService } from "../shipments/shipments.service";
import { CreateManualInvoiceDto, IssueInvoiceDto } from "./dto/issue-invoice.dto";
import { InvoiceTemplatesService } from "./invoice-templates.service";
import { SaveInvoiceTemplateDto } from "./dto/invoice-template.dto";

type InvoiceLineValues = { description: string; quantity: number | string; unitPrice: number | string };

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService, private readonly shipments: ShipmentsService, private readonly templates: InvoiceTemplatesService) {}

  async findAll(tenantId: string, pagination: PaginationDto) {
    const where = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: { customer: { select: { id: true, name: true, company: true, email: true, address: true, city: true, state: true, zipCode: true, country: true } }, shipment: { select: { trackingNumber: true, recipientName: true, customer: { select: { name: true } } } }, tenant: { select: { name: true, logo: true, email: true, phone: true, address: true } }, lines: true },
        orderBy: { issuedAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  listTemplates(tenantId: string) { return this.templates.list(tenantId); }
  createTemplate(tenantId: string, actorId: string, input: SaveInvoiceTemplateDto) { return this.templates.create(tenantId, actorId, input); }
  updateTemplate(tenantId: string, actorId: string, id: string, input: SaveInvoiceTemplateDto) { return this.templates.update(tenantId, actorId, id, input); }
  setDefaultTemplate(tenantId: string, actorId: string, id: string) { return this.templates.setDefault(tenantId, actorId, id); }
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
      include: { customer: { select: { id: true, name: true, company: true, email: true, address: true, city: true, state: true, zipCode: true, country: true } }, shipment: { select: { trackingNumber: true, recipientName: true, recipientAddress: true, customer: { select: { name: true } } } }, tenant: { select: { name: true, logo: true, email: true, phone: true, address: true } }, lines: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }

  async createFromShipment(tenantId: string, shipmentId: string, actorId: string, input?: IssueInvoiceDto) {
    const source = await this.shipments.getInvoiceSource(tenantId, shipmentId);
    const existing = await this.prisma.invoice.findFirst({ where: { tenantId, shipmentId } });
    if (existing) return this.findOne(tenantId, existing.id);
    if (source.status !== ShipmentStatus.DELIVERED) {
      throw new BadRequestException("Only delivered shipments can be invoiced");
    }

    const document = await this.getInvoiceDocumentSettings(tenantId);
    const templateSnapshot = await this.templates.resolveSnapshot(tenantId, input?.templateId);
    const taxRate = this.readTaxRate(document.taxRate);
    const lines: { description: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }[] = this.buildLines(input?.lines, `Delivery service — ${source.trackingNumber}`, new Prisma.Decimal(source.chargeAmount).toDecimalPlaces(4));
    const subtotal = lines.reduce((sum, line) => sum.add(line.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(4);
    const taxAmount = subtotal.mul(taxRate).div(100).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    const total = subtotal.add(taxAmount).toDecimalPlaces(4);

    try {
      const invoice = await this.prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            tenantId,
            customerId: source.customer.id,
            shipmentId,
            invoiceNumber: `INV-${source.trackingNumber}`,
            subtotal,
            taxRate,
            taxAmount,
            total,
            currency: source.currency,
            headerNote: document.headerNote,
            paymentTerms: document.paymentTerms,
            footerNote: document.footerNote,
            templateSnapshot: templateSnapshot as unknown as Prisma.InputJsonValue,
            lines: { create: lines },
          },
        });
        await tx.auditLog.create({ data: { tenantId, actorId, action: "invoice.issued", targetType: "invoice", targetId: created.id, metadata: { shipmentId, invoiceNumber: created.invoiceNumber, currency: source.currency, lineCount: lines.length, customLines: Boolean(input?.lines?.length) } } });
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

  async createManual(tenantId: string, actorId: string, input: CreateManualInvoiceDto) {
    const customer = await this.prisma.customer.findFirst({ where: { tenantId, id: input.customerId, isActive: true }, select: { id: true } });
    if (!customer) throw new BadRequestException("Choose an active customer in this workspace");
    if (!input.lines?.length) throw new BadRequestException("Add at least one invoice line");
    const [tenant, document, templateSnapshot] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }),
      this.getInvoiceDocumentSettings(tenantId),
      this.templates.resolveSnapshot(tenantId, input.templateId),
    ]);
    if (!tenant) throw new NotFoundException("Workspace not found");
    const taxRate = this.readTaxRate(input.taxRate ?? document.taxRate);
    const lines = this.buildLines(input.lines, "", new Prisma.Decimal(0));
    const subtotal = lines.reduce((sum, line) => sum.add(line.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(4);
    const taxAmount = subtotal.mul(taxRate).div(100).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    const total = subtotal.add(taxAmount).toDecimalPlaces(4);
    const invoiceNumber = input.invoiceNumber?.trim() || `INV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
    if (invoiceNumber.length > 80) throw new BadRequestException("Invoice number must be 80 characters or fewer");
    try {
      const invoice = await this.prisma.$transaction(async tx => {
        const created = await tx.invoice.create({ data: {
          tenantId, customerId: customer.id, shipmentId: null, invoiceNumber, status: "ISSUED",
          subtotal, taxRate, taxAmount, total, currency: tenant.currency,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          notes: input.notes?.trim() || null,
          headerNote: document.headerNote, paymentTerms: document.paymentTerms, footerNote: document.footerNote, templateSnapshot: templateSnapshot as unknown as Prisma.InputJsonValue,
          lines: { create: lines },
        } });
        await tx.auditLog.create({ data: { tenantId, actorId, action: "invoice.manual.issued", targetType: "invoice", targetId: created.id, metadata: { invoiceNumber, customerId: customer.id, currency: tenant.currency, lineCount: lines.length } } });
        return created;
      });
      return this.findOne(tenantId, invoice.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("An invoice with that number already exists in this workspace");
      throw error;
    }
  }

  /** Normalizes issued lines. The default (no custom lines) is one line for the delivery charge. */
  private buildLines(input: InvoiceLineValues[] | undefined, fallbackDescription: string, defaultUnitPrice: Prisma.Decimal) {
    if (!input?.length) {
      return [{ description: fallbackDescription, quantity: new Prisma.Decimal(1), unitPrice: defaultUnitPrice, lineTotal: defaultUnitPrice }];
    }
    return input.map(line => {
      const description = line.description.trim();
      if (!description) throw new BadRequestException("Each invoice line needs a description");
      const quantity = new Prisma.Decimal(line.quantity);
      const unitPrice = new Prisma.Decimal(line.unitPrice);
      if (quantity.isNaN() || !quantity.isFinite() || quantity.lte(0) || quantity.toNumber() > 1_000_000) throw new BadRequestException("Invoice line quantities must be numbers greater than zero");
      if (unitPrice.isNaN() || !unitPrice.isFinite() || unitPrice.lt(0) || unitPrice.toNumber() > 1_000_000_000) throw new BadRequestException("Invoice line unit prices must be numbers of zero or more");
      const lineTotal = quantity.mul(unitPrice).toDecimalPlaces(4);
      return { description, quantity, unitPrice, lineTotal };
    });
  }

  private async getInvoiceDocumentSettings(tenantId: string) {
    const settings = await this.prisma.tenantSetting.findMany({ where: { tenantId, key: { in: ["invoice.vatRate", "invoice.headerNote", "invoice.paymentTerms", "invoice.footerNote"] } } });
    const values = new Map(settings.map(setting => [setting.key, setting.value]));
    return { taxRate: values.get("invoice.vatRate") ?? "10", headerNote: values.get("invoice.headerNote")?.trim() || null, paymentTerms: values.get("invoice.paymentTerms")?.trim() || null, footerNote: values.get("invoice.footerNote")?.trim() || null };
  }

  private readTaxRate(value: string) {
    if (!/^(?:100(?:\.\d{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/.test(value)) throw new BadRequestException("Invoice VAT rate must be a number from 0 to 100");
    const rate = new Prisma.Decimal(value);
    if (rate.gt(100)) throw new BadRequestException("Invoice VAT rate must be a number from 0 to 100");
    return rate.toDecimalPlaces(4);
  }
}
