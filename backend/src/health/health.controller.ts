import { Controller, Get, Res } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import type { Response } from "express";
import { PrismaService } from "../common/prisma.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "Health check" })
  async check(@Res({ passthrough: true }) response: Response) {
    let database: "ok" | "unavailable" = "ok";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = "unavailable";
      response.status(503);
    }
    return {
      status: database === "ok" ? "ok" : "unavailable",
      service: "logistics-api",
      dependencies: { database },
      timestamp: new Date().toISOString(),
    };
  }
}

