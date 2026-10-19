import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from "class-validator";

export class InvoiceTemplateLayoutDto {
  @IsIn(["A4", "LETTER"])
  paperSize!: "A4" | "LETTER";

  @IsString() @Matches(/^#[0-9A-Fa-f]{6}$/)
  accentColor!: string;

  @IsIn(["Arial", "Georgia", "Helvetica", "Times New Roman"])
  fontFamily!: "Arial" | "Georgia" | "Helvetica" | "Times New Roman";

  @IsString() @MaxLength(80)
  title!: string;

  @IsString() @MaxLength(1000)
  headerText!: string;

  @IsString() @MaxLength(1000)
  footerText!: string;

  @IsBoolean() showLogo!: boolean;
  @IsBoolean() showBillingAddress!: boolean;
  @IsBoolean() showShipment!: boolean;
  @IsBoolean() showDueDate!: boolean;

  @IsIn(["plain", "striped", "bordered"])
  tableStyle!: "plain" | "striped" | "bordered";
}

export class SaveInvoiceTemplateDto {
  @IsString() @MaxLength(80)
  name!: string;

  @ValidateNested() @Type(() => InvoiceTemplateLayoutDto)
  layout!: InvoiceTemplateLayoutDto;

  @IsOptional() @IsInt() @Min(1)
  expectedVersion?: number;

  @IsOptional() @IsBoolean()
  makeDefault?: boolean;
}
