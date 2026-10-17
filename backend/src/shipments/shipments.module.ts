import { Module } from "@nestjs/common";
import { ShipmentsController, TrackingController } from "./shipments.controller";
import { ShipmentsService } from "./shipments.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [ShipmentsController, TrackingController],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}

