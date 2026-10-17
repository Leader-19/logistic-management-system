import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantStatus } from "@prisma/client";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaService } from "../common/prisma.service";
import { storagePath } from "../common/storage";

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findCurrent(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { settings: true },
    });
    if (!tenant) throw new NotFoundException("Tenant not found");
    return tenant;
  }

  async updateCurrent(tenantId: string, data: {
    name?: string; phone?: string; email?: string;
    address?: string; timezone?: string; currency?: string;
  }) {
    return this.prisma.tenant.update({ where: { id: tenantId }, data });
  }

  async uploadLogo(tenantId: string, file: { buffer: Buffer }) {
    const mimeType = privateImageMimeType(file.buffer);
    if (!mimeType) throw new BadRequestException("Choose a valid PNG, JPEG, or WebP logo");
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
    const directory = storagePath("tenant-logos", tenantId);
    await mkdir(directory, { recursive: true });
    for (const oldExtension of ["png", "jpg", "webp"]) await unlink(resolve(directory, `logo.${oldExtension}`)).catch(() => undefined);
    await writeFile(resolve(directory, `logo.${extension}`), file.buffer, { mode: 0o600 });
    return this.prisma.tenant.update({ where: { id: tenantId }, data: { logo: `/api/tenant/logo?v=${Date.now()}` } });
  }

  async getLogo(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { logo: true } });
    if (!tenant?.logo) throw new NotFoundException("Company logo not found");
    const directory = storagePath("tenant-logos", tenantId);
    for (const [extension, mimeType] of [["png", "image/png"], ["jpg", "image/jpeg"], ["webp", "image/webp"]] as const) {
      try { return { buffer: await readFile(resolve(directory, `logo.${extension}`)), mimeType }; } catch { /* Try the remaining image formats. */ }
    }
    throw new NotFoundException("Company logo file not found");
  }
  async cancelFromPlatform(tenantId: string, actorId: string, reason: string, confirmationSlug: string) {
    if (reason.trim().length < 5 || reason.trim().length > 500) throw new BadRequestException("Deletion reason must be 5 to 500 characters");
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true, status: true } });
    if (!tenant) throw new NotFoundException("Tenant not found");
    if (tenant.slug !== confirmationSlug) throw new BadRequestException("Tenant slug confirmation does not match");
    if (tenant.status === TenantStatus.CANCELLED) throw new ConflictException("Tenant is already cancelled");

    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.tenant.update({ where: { id: tenant.id }, data: { status: TenantStatus.CANCELLED } });
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId,
          action: "platform.tenant.cancelled",
          targetType: "tenant",
          targetId: tenant.id,
          metadata: { tenantName: tenant.name, tenantSlug: tenant.slug, previousStatus: tenant.status, reason: reason.trim() },
        },
      });
      return { id: cancelled.id, name: cancelled.name, slug: cancelled.slug, status: cancelled.status };
    });
  }

  async getSettings(tenantId: string) {
    return this.prisma.tenantSetting.findMany({ where: { tenantId } });
  }

  async updateSettings(tenantId: string, settings: Array<{ key: string; value: string }>) {
    await this.prisma.$transaction(
      settings.map((s) =>
        this.prisma.tenantSetting.upsert({
          where: { tenantId_key: { tenantId, key: s.key } },
          update: { value: s.value },
          create: { tenantId, key: s.key, value: s.value },
        }),
      ),
    );
    return this.getSettings(tenantId);
  }
}


function privateImageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}


