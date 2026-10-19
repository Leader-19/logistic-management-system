import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from "class-validator";

export class BulkRecordIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  ids!: string[];
}
