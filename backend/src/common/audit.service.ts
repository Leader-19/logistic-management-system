import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

type AuditRequestMetadata = {
  ip?: string;
  headers?: { [key: string]: string | string[] | undefined };
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    tenantId?: string | null;
    actorId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    outcome?: string;
    metadata?: Record<string, any>;
    req?: AuditRequestMetadata;
  }) {
    const userAgent = params.req?.headers?.["user-agent"];
    return this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId ?? null,
        actorId: params.actorId ?? null,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId ?? null,
        outcome: params.outcome ?? "success",
        metadata: params.metadata ?? {},
        ipAddress: params.req?.ip ?? null,
        userAgent: (typeof userAgent === "string" ? userAgent : userAgent?.[0])?.slice(0, 500) ?? null,
      },
    });
  }
}

