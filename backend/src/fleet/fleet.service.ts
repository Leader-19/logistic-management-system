import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";

@Injectable()
export class FleetService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: PaginationDto) {
    const where = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({ where, orderBy: [{ status: "asc" }, { registration: "asc" }], skip: query.skip, take: query.limit }),
      this.prisma.vehicle.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  async create(tenantId: string, actorId: string, input: { registration: string; vehicleType: string; make?: string; model?: string; capacityKg?: number; notes?: string }) {
    try {
      return await this.prisma.$transaction(async tx => {
        const vehicle = await tx.vehicle.create({ data: { tenantId, registration: input.registration.trim().toUpperCase(), vehicleType: input.vehicleType.trim(), make: input.make?.trim() || null, model: input.model?.trim() || null, capacityKg: input.capacityKg == null ? null : new Prisma.Decimal(input.capacityKg), notes: input.notes?.trim() || null } });
        await tx.auditLog.create({ data: { tenantId, actorId, action: "fleet.vehicle.created", targetType: "vehicle", targetId: vehicle.id, metadata: { registration: vehicle.registration } } });
        return vehicle;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BadRequestException("A vehicle with that registration already exists");
      throw error;
    }
  }

  async update(tenantId: string, vehicleId: string, actorId: string, input: { status?: string; make?: string; model?: string; capacityKg?: number | null; notes?: string }) {
    const exists = await this.prisma.vehicle.findFirst({ where: { tenantId, id: vehicleId } });
    if (!exists) throw new NotFoundException("Vehicle not found");
    if (input.status && !["ACTIVE", "MAINTENANCE", "RETIRED"].includes(input.status)) throw new BadRequestException("Choose ACTIVE, MAINTENANCE, or RETIRED");
    return this.prisma.$transaction(async tx => {
      const vehicle = await tx.vehicle.update({ where: { id: vehicleId }, data: { ...(input.status ? { status: input.status } : {}), ...(input.make !== undefined ? { make: input.make.trim() || null } : {}), ...(input.model !== undefined ? { model: input.model.trim() || null } : {}), ...(input.capacityKg !== undefined ? { capacityKg: input.capacityKg === null ? null : new Prisma.Decimal(input.capacityKg) } : {}), ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}) } });
      await tx.auditLog.create({ data: { tenantId, actorId, action: "fleet.vehicle.updated", targetType: "vehicle", targetId: vehicleId, metadata: { status: vehicle.status } } });
      return vehicle;
    });
  }
}
