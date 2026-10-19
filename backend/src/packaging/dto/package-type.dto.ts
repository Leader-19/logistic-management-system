import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Length, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreatePackageTypeDto {
  @IsString() @Length(1, 40) code!: string;
  @IsString() @Length(1, 120) name!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) lengthCm!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) widthCm!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) heightCm!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) tareWeightGrams?: number;
  @Type(() => Number) @IsInt() @Min(1) maxLoadGrams!: number;
  @IsOptional() @IsBoolean() stackable?: boolean;
}

export class UpdatePackageTypeStatusDto {
  @IsBoolean() isActive!: boolean;
}
