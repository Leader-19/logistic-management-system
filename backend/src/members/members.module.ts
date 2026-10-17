import { Module } from "@nestjs/common";
import { InvitationsController, MembersController } from "./members.controller";
import { MembersService } from "./members.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [MembersController, InvitationsController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}

