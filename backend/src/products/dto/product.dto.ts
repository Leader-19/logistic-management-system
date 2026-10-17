import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, Length, ValidateNested } from "class-validator";
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
export class ProductImportDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => ProductDto) rows!: ProductDto[];
}
