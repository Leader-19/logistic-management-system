import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from "class-validator";
export class CreateWarehouseDto {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
export class StockAdjustmentDto {
  @IsUUID() productId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(-1000000000) @Max(1000000000) quantityChange!: number;
  @IsString() @Length(3, 500) reason!: string;
}
