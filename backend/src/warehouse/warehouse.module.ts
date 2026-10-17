import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProductsModule } from "../products/products.module";
import { WarehouseController } from "./warehouse.controller";
import { WarehouseRepository } from "./repositories/warehouse.repository";
import { WarehouseService } from "./warehouse.service";
@Module({ imports: [AuthModule, ProductsModule], controllers: [WarehouseController], providers: [WarehouseService, WarehouseRepository], exports: [WarehouseService] })
export class WarehouseModule {}
