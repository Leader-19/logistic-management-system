import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SupplyChainController } from "./supply-chain.controller";
import { SupplyChainService } from "./supply-chain.service";

@Module({ imports: [AuthModule], controllers: [SupplyChainController], providers: [SupplyChainService] })
export class SupplyChainModule {}
