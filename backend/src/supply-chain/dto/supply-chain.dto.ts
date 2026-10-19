import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateNested } from "class-validator";
import { PurchaseOrderStatus } from "@prisma/client";
import { PaginationDto } from "../../common/dto/pagination.dto";

export class SupplierDto {
  @IsString() @Length(2, 160) name!: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class SupplyChainListQueryDto extends PaginationDto {
  @IsOptional() @IsString() @MaxLength(160) search?: string;
}

export class PurchaseOrderListQueryDto extends SupplyChainListQueryDto {
  @IsOptional() @IsEnum(PurchaseOrderStatus) status?: PurchaseOrderStatus;
}

export class PurchaseOrderLineDto {
  @IsUUID() productId!: string;
  @IsString() @Matches(/^\d+(?:\.\d{1,3})?$/) quantity!: string;
  @IsString() @Matches(/^\d+(?:\.\d{1,4})?$/) unitCost!: string;
}

export class CreatePurchaseOrderDto {
  @IsUUID() supplierId!: string;
  @IsUUID() warehouseId!: string;
  @IsOptional() @IsDateString() expectedAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PurchaseOrderLineDto) lines!: PurchaseOrderLineDto[];
}

export class ReceivePurchaseOrderLineDto {
  @IsUUID() lineId!: string;
  @IsString() @Matches(/^\d+(?:\.\d{1,3})?$/) quantity!: string;
}

export class ReceivePurchaseOrderDto {
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ReceivePurchaseOrderLineDto) lines!: ReceivePurchaseOrderLineDto[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
