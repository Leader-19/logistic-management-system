import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from "class-validator";
import { PaginationDto } from "../../common/dto/pagination.dto";
export class CreateWarehouseDto {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
export class StockAdjustmentDto {
  @IsUUID() productId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(-1000000000) @Max(1000000000) quantityChange!: number;
  @IsString() @Length(3, 500) reason!: string;
}
export class WarehouseInventoryQueryDto extends PaginationDto {
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsIn(["all", "low", "out"]) stockFilter: "all" | "low" | "out" = "all";
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) @Max(1000000000) lowStockThreshold = 10;
}
export class WarehouseMovementQueryDto extends PaginationDto {
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsIn(["all", "in", "out"]) direction: "all" | "in" | "out" = "all";
}
