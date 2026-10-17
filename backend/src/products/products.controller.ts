import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard, PermissionGuard, RequirePermissions, TenantGuard } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { PaginationDto } from "../common/dto/pagination.dto";
import { ProductCategoryDto, ProductDto, ProductImportDto, UpdateProductDto } from "./dto/product.dto";
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
  list(@Req() req: AuthenticatedRequest, @Query() pagination: PaginationDto, @Query("search") search?: string) { return this.products.list(req.tenantId, pagination, search); }

  @Get("categories")
  @RequirePermissions("products.read")
  categories(@Req() req: AuthenticatedRequest) { return this.products.listCategories(req.tenantId); }

  @Post("categories")
  @RequirePermissions("products.create")
  createCategory(@Req() req: AuthenticatedRequest, @Body() body: ProductCategoryDto) { return this.products.createCategory(req.tenantId, body.name); }

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
  create(@Req() req: AuthenticatedRequest, @Body() body: ProductDto) { return this.products.create(req.tenantId, body); }

  @Patch(":id")
  @RequirePermissions("products.update")
  update(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdateProductDto) { return this.products.update(req.tenantId, id, body); }
}
