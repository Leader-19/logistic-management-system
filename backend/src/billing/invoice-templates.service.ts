import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { SaveInvoiceTemplateDto } from "./dto/invoice-template.dto";

export type InvoiceTemplateLayout = {
  paperSize: "A4" | "LETTER";
  accentColor: string;
  fontFamily: "Arial" | "Georgia" | "Helvetica" | "Times New Roman";
  title: string;
  headerText: string;
  footerText: string;
  showLogo: boolean;
  showBillingAddress: boolean;
  showShipment: boolean;
  showDueDate: boolean;
  tableStyle: "plain" | "striped" | "bordered";
};

export const DEFAULT_INVOICE_TEMPLATE_LAYOUT: InvoiceTemplateLayout = {
  paperSize: "A4",
  accentColor: "#245edb",
  fontFamily: "Arial",
  title: "Invoice",
  headerText: "",
  footerText: "Thank you for your business.",
  showLogo: true,
  showBillingAddress: true,
  showShipment: true,
  showDueDate: true,
  tableStyle: "plain",
};

type InvoiceTemplateSnapshot = {
  templateId: string | null;
  name: string;
  version: number;
  layout: InvoiceTemplateLayout;
};

@Injectable()
export class InvoiceTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const templates = await this.prisma.invoiceTemplate.findMany({
      where: { tenantId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      orderBy: [{ defaultSlot: "desc" }, { name: "asc" }],
    });
    return templates.map(template => ({
      id: template.id,
      name: template.name,
      isDefault: template.defaultSlot === "default",
      currentVersion: template.currentVersion,
      layout: (template.versions[0]?.layout ?? DEFAULT_INVOICE_TEMPLATE_LAYOUT) as unknown as InvoiceTemplateLayout,
    }));
  }

  async create(tenantId: string, actorId: string, input: SaveInvoiceTemplateDto) {
    const name = this.validateName(input.name);
    const layout = this.normalize(input.layout);
    try {
      return await this.prisma.$transaction(async tx => {
        const hasDefault = await tx.invoiceTemplate.findFirst({ where: { tenantId, defaultSlot: "default" }, select: { id: true } });
        const makeDefault = input.makeDefault ?? !hasDefault;
        if (makeDefault) await tx.invoiceTemplate.updateMany({ where: { tenantId, defaultSlot: "default" }, data: { defaultSlot: null } });
        const template = await tx.invoiceTemplate.create({
          data: { tenantId, name, defaultSlot: makeDefault ? "default" : null, currentVersion: 1 },
        });
        await tx.invoiceTemplateVersion.create({
          data: { tenantId, templateId: template.id, version: 1, layout: layout as unknown as Prisma.InputJsonValue, createdBy: actorId },
        });
        await tx.auditLog.create({ data: { tenantId, actorId, action: "invoice.template.created", targetType: "invoice_template", targetId: template.id, metadata: { name, version: 1, isDefault: makeDefault } } });
        return { id: template.id, name: template.name, isDefault: template.defaultSlot === "default", currentVersion: template.currentVersion, layout };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("A template with that name already exists in this workspace");
      throw error;
    }
  }

  async update(tenantId: string, actorId: string, id: string, input: SaveInvoiceTemplateDto) {
    const name = this.validateName(input.name);
    const layout = this.normalize(input.layout);
    if (!input.expectedVersion) throw new BadRequestException("Template version is required when saving changes");
    try {
      return await this.prisma.$transaction(async tx => {
        const current = await tx.invoiceTemplate.findFirst({ where: { tenantId, id }, select: { id: true, name: true, defaultSlot: true, currentVersion: true } });
        if (!current) throw new NotFoundException("Invoice template not found");
        if (current.currentVersion !== input.expectedVersion) throw new ConflictException("This template changed in another session. Reload it before saving.");
        const nextVersion = current.currentVersion + 1;
        await tx.invoiceTemplateVersion.create({ data: { tenantId, templateId: id, version: nextVersion, layout: layout as unknown as Prisma.InputJsonValue, createdBy: actorId } });
        const changed = await tx.invoiceTemplate.updateMany({ where: { tenantId, id, currentVersion: current.currentVersion }, data: { name, currentVersion: nextVersion } });
        if (changed.count !== 1) throw new ConflictException("This template changed in another session. Reload it before saving.");
        if (input.makeDefault) {
          await tx.invoiceTemplate.updateMany({ where: { tenantId, defaultSlot: "default" }, data: { defaultSlot: null } });
          await tx.invoiceTemplate.update({ where: { id }, data: { defaultSlot: "default" } });
        }
        await tx.auditLog.create({ data: { tenantId, actorId, action: "invoice.template.updated", targetType: "invoice_template", targetId: id, metadata: { name, version: nextVersion, isDefault: input.makeDefault ?? current.defaultSlot === "default" } } });
        return { id, name, isDefault: input.makeDefault ?? current.defaultSlot === "default", currentVersion: nextVersion, layout };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("The template name or version is already in use");
      throw error;
    }
  }

  async setDefault(tenantId: string, actorId: string, id: string) {
    try {
      return await this.prisma.$transaction(async tx => {
        const template = await tx.invoiceTemplate.findFirst({ where: { tenantId, id }, select: { id: true, name: true } });
        if (!template) throw new NotFoundException("Invoice template not found");
        await tx.invoiceTemplate.updateMany({ where: { tenantId, defaultSlot: "default" }, data: { defaultSlot: null } });
        await tx.invoiceTemplate.update({ where: { id }, data: { defaultSlot: "default" } });
        await tx.auditLog.create({ data: { tenantId, actorId, action: "invoice.template.default_changed", targetType: "invoice_template", targetId: id, metadata: { name: template.name } } });
        return { id, name: template.name, isDefault: true };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Another template was set as default. Please retry.");
      throw error;
    }
  }

  async resolveSnapshot(tenantId: string, templateId?: string): Promise<InvoiceTemplateSnapshot> {
    const template = await this.prisma.invoiceTemplate.findFirst({
      where: templateId ? { tenantId, id: templateId } : { tenantId, defaultSlot: "default" },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!template && templateId) throw new NotFoundException("Invoice template not found in this workspace");
    if (!template) return { templateId: null, name: "Default", version: 0, layout: DEFAULT_INVOICE_TEMPLATE_LAYOUT };
    return {
      templateId: template.id,
      name: template.name,
      version: template.versions[0]?.version ?? template.currentVersion,
      layout: (template.versions[0]?.layout ?? DEFAULT_INVOICE_TEMPLATE_LAYOUT) as unknown as InvoiceTemplateLayout,
    };
  }

  private validateName(value: string) {
    const name = value.trim();
    if (!name || name.length > 80) throw new BadRequestException("Template name must contain 1 to 80 characters");
    return name;
  }

  private normalize(input: SaveInvoiceTemplateDto["layout"]): InvoiceTemplateLayout {
    return {
      paperSize: input.paperSize,
      accentColor: input.accentColor.toUpperCase(),
      fontFamily: input.fontFamily,
      title: input.title.trim() || "Invoice",
      headerText: input.headerText.trim(),
      footerText: input.footerText.trim(),
      showLogo: input.showLogo,
      showBillingAddress: input.showBillingAddress,
      showShipment: input.showShipment,
      showDueDate: input.showDueDate,
      tableStyle: input.tableStyle,
    };
  }
}
