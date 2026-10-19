import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard, PermissionGuard, RequirePermissions, TenantGuard } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";

import { ProductCategoryBatchDto, ProductCategoryDto, ProductCategoryListQueryDto, ProductDto, ProductImportDto, ProductListQueryDto, UpdateProductDto } from "./dto/product.dto";
import { BulkRecordIdsDto } from "../common/dto/bulk-record-ids.dto";
import { ProductImportRow, ProductsService } from "./products.service";

@ApiTags("products")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant-id", required: true })
@Controller("products")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions("products.read")
  list(@Req() req: AuthenticatedRequest, @Query() query: ProductListQueryDto) { return this.products.list(req.tenantId, query, query.search, query.status, query.categoryIds); }

  @Post("bulk/archive")
  @RequirePermissions("products.delete")
  @ApiOperation({ summary: "Archive up to 100 products in the current tenant while retaining stock history" })
  bulkArchive(@Req() req: AuthenticatedRequest, @Body() body: BulkRecordIdsDto) { return this.products.bulkArchive(req.tenantId, req.user.sub, body.ids); }

  @Get("categories")
  @RequirePermissions("products.read")
  categories(@Req() req: AuthenticatedRequest, @Query() query: ProductCategoryListQueryDto) { return this.products.listCategories(req.tenantId, query, query.search); }

  @Post("categories")
  @RequirePermissions("products.create")
  createCategory(@Req() req: AuthenticatedRequest, @Body() body: ProductCategoryDto) { return this.products.createCategory(req.tenantId, req.user.sub, body.name); }

  @Post("categories/batch")
  @RequirePermissions("products.create")
  @ApiOperation({ summary: "Create up to 100 categories in one request" })
  createCategories(@Req() req: AuthenticatedRequest, @Body() body: ProductCategoryBatchDto) { return this.products.createCategories(req.tenantId, req.user.sub, body.names); }

  @Post("categories/import")
  @RequirePermissions("products.create")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: "Create categories from a CSV or Excel file" })
  importCategories(@Req() req: AuthenticatedRequest, @UploadedFile() file?: { originalname: string; buffer: Buffer }) {
    if (!file) throw new BadRequestException("Choose a .csv or .xlsx file");
    return this.products.importCategories(req.tenantId, req.user.sub, file.originalname, file.buffer);
  }

  @Patch("categories/:id")
  @RequirePermissions("products.update")
  updateCategory(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: ProductCategoryDto) { return this.products.updateCategory(req.tenantId, req.user.sub, id, body.name); }

  @Delete("categories/:id")
  @RequirePermissions("products.delete")
  deleteCategory(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.products.deleteCategory(req.tenantId, req.user.sub, id); }

  @Get("barcode/:barcode")
  @RequirePermissions("products.read")
  @ApiOperation({ summary: "Look up a product using a handheld barcode scanner" })
  scan(@Req() req: AuthenticatedRequest, @Param("barcode") barcode: string) { return this.products.findByBarcode(req.tenantId, barcode); }

  @Post("import/preview")
  @RequirePermissions("products.create")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: "Preview a CSV or Excel product import" })
  previewImport(@UploadedFile() file?: { originalname: string; buffer: Buffer }) {
    if (!file) throw new BadRequestException("Choose a CSV or Excel file");
    return this.products.parseImport(file.originalname, file.buffer);
  }

  @Post("import")
  @RequirePermissions("products.create")
  @ApiOperation({ summary: "Import validated product rows and return row-level conflicts" })
  import(@Req() req: AuthenticatedRequest, @Body() body: ProductImportDto) { return this.products.importRows(req.tenantId, req.user.sub, body.rows as ProductImportRow[]); }

  @Post(":id/image")
  @RequirePermissions("products.update")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 3 * 1024 * 1024 } }))
  @ApiOperation({ summary: "Upload a private product image (PNG, JPEG, or WebP; maximum 3 MB)" })
  uploadImage(@Req() req: AuthenticatedRequest, @Param("id") id: string, @UploadedFile() file?: { buffer: Buffer }) {
    if (!file) throw new BadRequestException("Choose a product image to upload");
    return this.products.uploadImage(req.tenantId, id, file);
  }

  @Get(":id/image")
  @RequirePermissions("products.read")
  async image(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const image = await this.products.getImage(req.tenantId, id);
    return new StreamableFile(image.buffer, { type: image.mimeType, disposition: "inline" });
  }

  @Post()
  @RequirePermissions("products.create")
  create(@Req() req: AuthenticatedRequest, @Body() body: ProductDto) { return this.products.create(req.tenantId, body, req.user.sub); }

  @Patch(":id")
  @RequirePermissions("products.update")
  update(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdateProductDto) { return this.products.update(req.tenantId, id, body, req.user.sub); }

  @Delete(":id")
  @RequirePermissions("products.delete")
  remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.products.archive(req.tenantId, req.user.sub, id); }
}
