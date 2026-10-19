import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";

export class InvoiceLineInput {
  @ApiProperty({ example: "Delivery service — TRK-1234", maxLength: 500 })
  @IsString()
  @Length(1, 500)
  description!: string;

  @ApiProperty({ example: 1, minimum: 0.0001 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(1_000_000)
  quantity!: number;

  @ApiProperty({ example: 12.5, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1_000_000_000)
  unitPrice!: number;
}

export class IssueInvoiceDto {
  @ApiPropertyOptional({ type: [InvoiceLineInput], description: "Custom invoice lines. When omitted, a single line for the shipment delivery charge is used. Totals are always recalculated server-side." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInput)
  lines!: InvoiceLineInput[];

  @ApiPropertyOptional({ format: "uuid", description: "Template to apply; defaults to the workspace template." })
  @IsOptional() @IsUUID()
  templateId?: string;
}

export class ManualInvoiceLineInput {
  @ApiProperty({ example: "Monthly logistics service", maxLength: 500 })
  @IsString() @Length(1, 500)
  description!: string;

  @ApiProperty({ example: "2.0000", minimum: 0.0001 })
  @IsString() @Matches(/^\d+(?:\.\d{1,4})?$/)
  quantity!: string;

  @ApiProperty({ example: "15.5000", minimum: 0 })
  @IsString() @Matches(/^\d+(?:\.\d{1,4})?$/)
  unitPrice!: string;
}

export class CreateManualInvoiceDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ example: "INV-2026-0042", maxLength: 80 })
  @IsOptional() @IsString() @MaxLength(80)
  invoiceNumber?: string;

  @ApiPropertyOptional({ example: "2026-11-17", format: "date" })
  @IsOptional() @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ example: "10.0000", description: "Tax percentage. Defaults to the tenant invoice VAT setting." })
  @IsOptional() @IsString() @Matches(/^\d{1,3}(?:\.\d{1,4})?$/)
  taxRate?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  @ApiProperty({ type: [ManualInvoiceLineInput] })
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ManualInvoiceLineInput)
  lines!: ManualInvoiceLineInput[];

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional() @IsUUID()
  templateId?: string;
}
