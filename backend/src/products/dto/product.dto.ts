import { Transform, Type } from "class-transformer";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength, ValidateNested } from "class-validator";
export class ProductDto {
  @IsString() @Length(1, 80) sku!: string;
  @IsOptional() @IsString() @Length(1, 80) barcode?: string;
  @IsString() @Length(1, 160) name!: string;
  @IsOptional() @IsString() @Length(1, 80) category?: string;
  @IsOptional() @IsString() @Length(1, 1000) description?: string;
}
export class UpdateProductDto {
  @IsOptional() @IsString() @Length(1, 80) sku?: string;
  @IsOptional() @IsString() @Length(1, 80) barcode?: string;
  @IsOptional() @IsString() @Length(1, 160) name?: string;
  @IsOptional() @IsString() @Length(1, 80) category?: string;
  @IsOptional() @IsString() @Length(1, 1000) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class ProductCategoryDto { @IsString() @Length(1, 80) name!: string; }
export class ProductCategoryBatchDto {
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @Length(1, 80, { each: true }) names!: string[];
}
export class ProductCategoryListQueryDto extends PaginationDto {
  @IsOptional() @IsString() @MaxLength(80) search?: string;
}
export class ProductImportDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => ProductDto) rows!: ProductDto[];
}

export class ProductListQueryDto extends PaginationDto {
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsIn(["active", "inactive", "all"]) status: "active" | "inactive" | "all" = "active";
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.split(",").filter(Boolean) : value) @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) categoryIds?: string[];
}
