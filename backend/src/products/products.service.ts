import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Workbook } from "exceljs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaService } from "../common/prisma.service";
import { storagePath } from "../common/storage";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";
import { ProductsRepository } from "./repositories/products.repository";

export type ProductImportRow = { sku: string; barcode?: string; name: string; category?: string; description?: string };

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly repository: ProductsRepository) {}

  async list(tenantId: string, pagination: PaginationDto, search?: string, status: "active" | "inactive" | "all" = "active", categoryIds?: string[]) {
    const result = await this.repository.list(tenantId, pagination, search, status, categoryIds);
    return paginate(result.data, result.total, pagination);
  }

  async listCategories(tenantId: string, pagination: PaginationDto, search?: string) {
    const result = await this.repository.listCategories(tenantId, pagination, search);
    return paginate(result.data, result.total, pagination);
  }

  async createCategory(tenantId: string, actorId: string, name: string) {
    try {
      const category = await this.repository.createCategory(tenantId, name.trim());
      await this.audit(tenantId, actorId, "products.category.created", category.id, { name: category.name });
      return category;
    }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("That category already exists"); throw error; }
  }

  async createCategories(tenantId: string, actorId: string, names: string[]) {
    const normalized = names.map(name => name.trim()).filter(Boolean);
    if (!normalized.length) throw new BadRequestException("Add at least one category name");
    const uniqueNames = [...new Set(normalized)];
    const created: Awaited<ReturnType<ProductsService["createCategory"]>>[] = [];
    const skipped: string[] = [];
    for (const name of uniqueNames) {
      if (await this.repository.findCategory(tenantId, name)) { skipped.push(name); continue; }
      try { created.push(await this.createCategory(tenantId, actorId, name)); }
      catch (error) {
        if (error instanceof ConflictException) skipped.push(name);
        else throw error;
      }
    }
    for (const repeatedName of normalized.filter((name, index) => normalized.indexOf(name) !== index)) skipped.push(repeatedName);
    return { createdCount: created.length, skippedCount: skipped.length, created, skipped };
  }

  async importCategories(tenantId: string, actorId: string, fileName: string, buffer: Buffer) {
    const extension = fileName.toLowerCase().split(".").pop();
    let rawRows: unknown[][];
    if (extension === "csv") rawRows = parseCsv(buffer.toString("utf8"));
    else if (extension === "xlsx") {
      if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new BadRequestException("The uploaded file is not a valid Excel workbook");
      const workbook = new Workbook();
      try { await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]); }
      catch { throw new BadRequestException("The Excel workbook could not be read. Re-save it as .xlsx or upload a .csv file."); }
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new BadRequestException("The workbook has no worksheet");
      rawRows = sheet.getSheetValues().slice(1).map(row => Array.isArray(row) ? row.slice(1) : []);
    } else throw new BadRequestException("Choose a .csv or .xlsx file");

    const [headerRow, ...dataRows] = rawRows;
    if (!headerRow) throw new BadRequestException("The import file is empty");
    const headers = headerRow.map((value, index) => (index === 0 ? String(value ?? "").replace(/^\uFEFF/, "") : String(value ?? "")).trim().toLowerCase());
    const nameColumn = headers.findIndex(header => ["name", "category", "category name"].includes(header));
    if (nameColumn < 0) throw new BadRequestException("The file must include a name column");
    const names: string[] = [];
    const errors: Array<{ row: number; message: string }> = [];
    dataRows.forEach((row, index) => {
      const name = String(row[nameColumn] ?? "").trim();
      if (!name && row.every(value => !String(value ?? "").trim())) return;
      if (!name) errors.push({ row: index + 2, message: "Category name is required" });
      else if (name.length > 80) errors.push({ row: index + 2, message: "Category name cannot exceed 80 characters" });
      else names.push(name);
    });
    if (dataRows.length > 100) throw new BadRequestException("Category imports are limited to 100 data rows");
    const result = names.length ? await this.createCategories(tenantId, actorId, names) : { createdCount: 0, skippedCount: 0, skipped: [] as string[] };
    await this.prisma.auditLog.create({ data: { tenantId, actorId, action: "products.categories.imported", targetType: "category_import", metadata: { attempted: dataRows.length, created: result.createdCount, skipped: result.skippedCount, errors: errors.length } } });
    return { ...result, errors };
  }

  async updateCategory(tenantId: string, actorId: string, id: string, name: string) {
    if (!(await this.repository.findTenantCategory(tenantId, id))) throw new NotFoundException("Category not found");
    try {
      const category = await this.repository.updateCategory(tenantId, id, name.trim());
      await this.audit(tenantId, actorId, "products.category.updated", id, { name: category.name });
      return category;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("That category already exists");
      throw error;
    }
  }

  async deleteCategory(tenantId: string, actorId: string, id: string) {
    const category = await this.repository.findTenantCategory(tenantId, id);
    if (!category) throw new NotFoundException("Category not found");
    if (category._count.products > 0) throw new ConflictException("This category is assigned to products. Move those products to another category before deleting it.");
    await this.repository.deleteCategory(tenantId, id);
    await this.audit(tenantId, actorId, "products.category.deleted", id, { name: category.name });
    return { message: "Category deleted" };
  }

  async create(tenantId: string, input: ProductImportRow, actorId?: string) {
    const categoryId = await this.resolveCategory(tenantId, input.category);
    try {
      const product = await this.repository.create(tenantId, { tenantId, sku: input.sku.trim(), barcode: input.barcode?.trim() || null, name: input.name.trim(), description: input.description?.trim() || null, categoryId });
      if (actorId) await this.audit(tenantId, actorId, "products.created", product.id, { sku: product.sku });
      return product;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("SKU or barcode already exists in this workspace");
      throw error;
    }
  }

  async update(tenantId: string, id: string, input: Partial<ProductImportRow> & { isActive?: boolean }, actorId?: string) {
    const exists = await this.repository.findTenantProduct(tenantId, id);
    if (!exists) throw new NotFoundException("Product not found");
    const categoryId = input.category === undefined ? undefined : await this.resolveCategory(tenantId, input.category);
    try {
      const product = await this.repository.update(tenantId, id, { ...(input.sku !== undefined ? { sku: input.sku.trim() } : {}), ...(input.barcode !== undefined ? { barcode: input.barcode.trim() || null } : {}), ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.description !== undefined ? { description: input.description.trim() || null } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}), ...(categoryId !== undefined ? { categoryId } : {}) });
      if (actorId) await this.audit(tenantId, actorId, input.isActive === undefined ? "products.updated" : input.isActive ? "products.activated" : "products.deactivated", id, { fields: Object.keys(input) });
      return product;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("SKU or barcode already exists in this workspace");
      throw error;
    }
  }

  async archive(tenantId: string, actorId: string, id: string) {
    const product = await this.repository.findTenantProduct(tenantId, id);
    if (!product) throw new NotFoundException("Product not found");
    if (!product.isActive) return { message: "Product is already archived" };
    await this.repository.update(tenantId, id, { isActive: false });
    await this.audit(tenantId, actorId, "products.archived", id, { sku: product.sku });
    return { message: "Product archived" };
  }

  async bulkArchive(tenantId: string, actorId: string, ids: string[]) {
    return this.prisma.$transaction(async tx => {
      const active = await tx.product.findMany({ where: { tenantId, id: { in: ids }, isActive: true }, select: { id: true, sku: true } });
      if (!active.length) return { archivedCount: 0 };
      await tx.product.updateMany({ where: { tenantId, id: { in: active.map(product => product.id) }, isActive: true }, data: { isActive: false } });
      await tx.auditLog.createMany({ data: active.map(product => ({ tenantId, actorId, action: "products.archived", targetType: "product_catalog", targetId: product.id, metadata: { sku: product.sku, source: "bulk_action" } })) });
      return { archivedCount: active.length };
    });
  }

  private audit(tenantId: string, actorId: string, action: string, targetId: string, metadata: Prisma.InputJsonObject) {
    return this.prisma.auditLog.create({ data: { tenantId, actorId, action, targetType: "product_catalog", targetId, metadata } });
  }

  async uploadImage(tenantId: string, productId: string, file: { buffer: Buffer }) {
    const product = await this.repository.findActiveById(tenantId, productId);
    if (!product) throw new NotFoundException("Product not found");
    const mimeType = imageMimeType(file.buffer);
    if (!mimeType) throw new BadRequestException("Choose a valid PNG, JPEG, or WebP image");
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
    const directory = storagePath("product-images", tenantId);
    await mkdir(directory, { recursive: true });
    for (const oldExtension of ["png", "jpg", "webp"]) await unlink(resolve(directory, `${productId}.${oldExtension}`)).catch(() => undefined);
    await writeFile(resolve(directory, `${productId}.${extension}`), file.buffer, { mode: 0o600 });
    return this.repository.saveImage(productId, `/api/products/${productId}/image?v=${Date.now()}`);
  }

  async getImage(tenantId: string, productId: string) {
    const product = await this.repository.findImage(tenantId, productId);
    if (!product?.imageUrl) throw new NotFoundException("Product image not found");
    const directory = storagePath("product-images", tenantId);
    for (const [extension, mimeType] of [["png", "image/png"], ["jpg", "image/jpeg"], ["webp", "image/webp"]] as const) {
      try { return { buffer: await readFile(resolve(directory, `${productId}.${extension}`)), mimeType }; } catch { /* Try the remaining image formats. */ }
    }
    throw new NotFoundException("Product image file not found");
  }
  async findByBarcode(tenantId: string, barcode: string) {
    const product = await this.repository.findActiveByBarcode(tenantId, barcode);
    if (!product) throw new NotFoundException("No active product matches that barcode");
    return product;
  }

  async getActiveById(tenantId: string, id: string) {
    const product = await this.repository.findActiveById(tenantId, id);
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  async parseImport(fileName: string, buffer: Buffer) {
    const extension = fileName.toLowerCase().split(".").pop();
    let rawRows: unknown[][];
    if (extension === "csv") rawRows = parseCsv(buffer.toString("utf8"));
    else if (extension === "xlsx") {
      if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new BadRequestException("The uploaded file is not a valid Excel workbook");
      const workbook = new Workbook();
      try {
        await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      } catch {
        throw new BadRequestException("The Excel workbook could not be read. Re-save it as an .xlsx workbook, or import a .csv file instead.");
      }
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new BadRequestException("The workbook has no worksheet");
      rawRows = sheet.getSheetValues().slice(1).map(row => Array.isArray(row) ? row.slice(1) : []);
    } else throw new BadRequestException("Choose a .csv or .xlsx file");

    if (rawRows.length > 501) throw new BadRequestException("Imports are limited to 500 data rows");
    const [headerRow, ...dataRows] = rawRows;
    if (!headerRow) throw new BadRequestException("The import file is empty");
    const headers = headerRow.map((value, index) => (index === 0 ? String(value ?? "").replace(/^\uFEFF/, "") : String(value ?? "")).trim().toLowerCase());
    for (const required of ["sku", "name"]) if (!headers.includes(required)) throw new BadRequestException(`The file must include a ${required} column`);
    const rows: ProductImportRow[] = [];
    const errors: { row: number; message: string }[] = [];
    dataRows.forEach((values, index) => {
      if (!values.some(value => String(value ?? "").trim())) return;
      const get = (key: string) => { const column = headers.indexOf(key); return column < 0 ? "" : String(values[column] ?? "").trim(); };
      const row = { sku: get("sku"), barcode: get("barcode") || undefined, name: get("name"), category: get("category") || undefined, description: get("description") || undefined };
      if (!row.sku || !row.name) errors.push({ row: index + 2, message: "SKU and name are required" });
      else if (row.sku.length > 80 || row.name.length > 160 || (row.barcode?.length ?? 0) > 80) errors.push({ row: index + 2, message: "SKU/name/barcode exceeds the supported length" });
      else rows.push(row);
    });
    return { rows, errors };
  }

  async importRows(tenantId: string, actorId: string, rows: ProductImportRow[]) {
    if (rows.length > 500) throw new BadRequestException("Imports are limited to 500 valid rows");
    const accepted: ProductImportRow[] = [];
    const errors: { row: number; message: string }[] = [];
    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();
    rows.forEach((row, index) => {
      const sku = row.sku.trim().toLowerCase();
      const barcode = row.barcode?.trim();
      if (!sku || !row.name.trim()) errors.push({ row: index + 1, message: "SKU and name are required" });
      else if (seenSkus.has(sku) || (barcode && seenBarcodes.has(barcode))) errors.push({ row: index + 1, message: "Duplicate SKU or barcode in this file" });
      else { seenSkus.add(sku); if (barcode) seenBarcodes.add(barcode); accepted.push(row); }
    });
    let created = 0;
    for (let offset = 0; offset < accepted.length; offset += 50) {
      const batch = accepted.slice(offset, offset + 50);
      for (let index = 0; index < batch.length; index++) {
        try {
          await this.create(tenantId, batch[index]);
          created++;
        } catch (error) {
          errors.push({ row: offset + index + 1, message: error instanceof Error ? error.message : "Could not import row" });
        }
      }
    }
    await this.prisma.auditLog.create({ data: { tenantId, actorId, action: "products.imported", targetType: "product_import", metadata: { attempted: rows.length, created, errors: errors.length } } });
    return { created, errors };
  }

  private async resolveCategory(tenantId: string, name?: string) {
    if (!name?.trim()) return null;
    const normalized = name.trim();
    const category = await this.repository.findCategory(tenantId, normalized);
    if (!category) throw new BadRequestException(`Category “${normalized}” does not exist; create it first`);
    return category.id;
  }
}

function parseCsv(text: string): unknown[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') { field += '"'; index++; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(field); field = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += character;
  }
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function imageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}






