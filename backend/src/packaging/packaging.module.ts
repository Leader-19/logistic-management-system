import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PackagingController } from "./packaging.controller";
import { PackagingService } from "./packaging.service";

@Module({ imports: [AuthModule], controllers: [PackagingController], providers: [PackagingService] })
export class PackagingModule {}
