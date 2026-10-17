import { Module } from "@nestjs/common";
import { AuditController } from "./audit.controller";
import { AuditLogsService } from "./audit.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditModule {}

