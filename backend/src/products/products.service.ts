import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
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

  async list(tenantId: string, pagination: PaginationDto, search?: string) {
    const result = await this.repository.list(tenantId, pagination, search);
    return paginate(result.data, result.total, pagination);
  }

  listCategories(tenantId: string) {
    return this.repository.listCategories(tenantId);
  }

  async createCategory(tenantId: string, name: string) {
    try { return await this.repository.createCategory(tenantId, name.trim()); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("That category already exists"); throw error; }
  }

  async create(tenantId: string, input: ProductImportRow) {
    const categoryId = await this.resolveCategory(tenantId, input.category);
    try {
      return await this.repository.create(tenantId, { tenantId, sku: input.sku.trim(), barcode: input.barcode?.trim() || null, name: input.name.trim(), description: input.description?.trim() || null, categoryId });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("SKU or barcode already exists in this workspace");
      throw error;
    }
  }

  async update(tenantId: string, id: string, input: Partial<ProductImportRow> & { isActive?: boolean }) {
    const exists = await this.repository.findTenantProduct(tenantId, id);
    if (!exists) throw new NotFoundException("Product not found");
    const categoryId = input.category === undefined ? undefined : await this.resolveCategory(tenantId, input.category);
    try {
      return await this.repository.update(id, { ...(input.sku !== undefined ? { sku: input.sku.trim() } : {}), ...(input.barcode !== undefined ? { barcode: input.barcode.trim() || null } : {}), ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.description !== undefined ? { description: input.description.trim() || null } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}), ...(categoryId !== undefined ? { categoryId } : {}) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("SKU or barcode already exists in this workspace");
      throw error;
    }
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
      const workbook = new ExcelJS.Workbook();
      const bytes = new Uint8Array(buffer);
      const excelBuffer = Buffer.from(bytes.buffer as ArrayBuffer);
      await workbook.xlsx.load(excelBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new BadRequestException("The workbook has no worksheet");
      rawRows = sheet.getSheetValues().slice(1).map(row => Array.isArray(row) ? row.slice(1) : []);
    } else throw new BadRequestException("Choose a .csv or .xlsx file");

    if (rawRows.length > 501) throw new BadRequestException("Imports are limited to 500 data rows");
    const [headerRow, ...dataRows] = rawRows;
    if (!headerRow) throw new BadRequestException("The import file is empty");
    const headers = headerRow.map(value => String(value ?? "").trim().toLowerCase());
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






