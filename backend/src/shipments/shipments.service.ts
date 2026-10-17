import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ShipmentStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";

/** Explicit allowed status transitions */
const ALLOWED_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  BOOKED: [ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.CANCELLED],
  PICKUP_SCHEDULED: [ShipmentStatus.COLLECTED, ShipmentStatus.CANCELLED],
  COLLECTED: [ShipmentStatus.AT_HUB],
  AT_HUB: [ShipmentStatus.IN_TRANSIT],
  IN_TRANSIT: [ShipmentStatus.AT_HUB, ShipmentStatus.OUT_FOR_DELIVERY],
  OUT_FOR_DELIVERY: [ShipmentStatus.DELIVERED, ShipmentStatus.DELIVERY_FAILED],
  DELIVERY_FAILED: [ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.RETURNED, ShipmentStatus.CANCELLED],
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
};

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, dto: PaginationDto, filters?: {
    status?: ShipmentStatus; customerId?: string; search?: string;
  }) {
    const where: any = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.search) {
      where.OR = [
        { trackingNumber: { contains: filters.search, mode: "insensitive" } },
        { senderName: { contains: filters.search, mode: "insensitive" } },
        { recipientName: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.shipment.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          assignedDriver: { include: { user: { select: { id: true, fullName: true, phone: true } } } },
          _count: { select: { events: true } },
        },
        skip: dto.skip,
        take: dto.limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.shipment.count({ where }),
    ]);
    return paginate(data, total, dto);
  }

  async findOne(tenantId: string, id: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { id, tenantId },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        events: { orderBy: { occurredAt: "asc" } },
        assignedDriver: { include: { user: { select: { id: true, fullName: true, phone: true } } } },
        proofOfDelivery: true,
        invoice: { select: { id: true, invoiceNumber: true, total: true, currency: true } },
      },
    });
    if (!shipment) throw new NotFoundException("Shipment not found");
    return shipment;
  }

  async getInvoiceSource(tenantId: string, shipmentId: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { tenantId, id: shipmentId },
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        chargeAmount: true,
        currency: true,
        customer: { select: { id: true, name: true } },
      },
    });
    if (!shipment) throw new NotFoundException("Shipment not found");
    return shipment;
  }

  async summary(tenantId: string) {
    const [total, byStatus] = await Promise.all([
      this.prisma.shipment.count({ where: { tenantId } }),
      this.prisma.shipment.groupBy({ by: ["status"], where: { tenantId }, _count: { _all: true } }),
    ]);
    return { total, byStatus: byStatus.map(item => ({ status: item.status, count: item._count._all })) };
  }

  async create(tenantId: string, actorId: string, data: {
    customerId: string; senderName: string; senderPhone?: string; senderAddress?: string;
    recipientName: string; recipientPhone?: string; recipientAddress: string;
    weightGrams: number; lengthCm?: number; widthCm?: number; heightCm?: number;
    serviceType?: string; notes?: string;
  }) {
    // Validate customer belongs to tenant
    const customer = await this.prisma.customer.findFirst({
      where: { id: data.customerId, tenantId },
    });
    if (!customer) throw new BadRequestException("Customer not found");

    const [tenant, flatRateSetting] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }),
      this.prisma.tenantSetting.findUnique({ where: { tenantId_key: { tenantId, key: "shipment.flatRate" } } }),
    ]);
    const rateText = flatRateSetting?.value?.trim();
    if (!tenant || !rateText || !/^\d{1,10}(?:\.\d{1,2})?$/.test(rateText)) {
      throw new BadRequestException("Set a valid flat shipment rate in Settings before booking shipments");
    }
    const chargeAmount = new Prisma.Decimal(rateText);

    const trackingNumber = `TN-${randomBytes(4).toString("hex").toUpperCase()}`;

    return this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          tenantId,
          customerId: data.customerId,
          trackingNumber,
          status: ShipmentStatus.BOOKED,
          senderName: data.senderName,
          senderPhone: data.senderPhone,
          senderAddress: data.senderAddress,
          recipientName: data.recipientName,
          recipientPhone: data.recipientPhone,
          recipientAddress: data.recipientAddress,
          weightGrams: data.weightGrams,
          lengthCm: data.lengthCm,
          widthCm: data.widthCm,
          heightCm: data.heightCm,
          chargeAmount,
          currency: tenant.currency,
          serviceType: data.serviceType,
          notes: data.notes,
        },
        include: { customer: { select: { id: true, name: true } } },
      });

      // Create initial event
      await tx.shipmentEvent.create({
        data: {
          tenantId,
          shipmentId: shipment.id,
          sequence: 1,
          status: ShipmentStatus.BOOKED,
          note: "Shipment created",
          actorId,
          source: "staff",
        },
      });

      return shipment;
    });
  }

  async update(tenantId: string, id: string, data: {
    senderName?: string; senderPhone?: string; senderAddress?: string;
    recipientName?: string; recipientPhone?: string; recipientAddress?: string;
    weightGrams?: number; serviceType?: string; notes?: string;
  }) {
    const shipment = await this.prisma.shipment.findFirst({ where: { id, tenantId } });
    if (!shipment) throw new NotFoundException("Shipment not found");
    if (shipment.status !== ShipmentStatus.BOOKED)
      throw new BadRequestException("Can only edit shipments in BOOKED status");

    return this.prisma.shipment.update({ where: { id }, data });
  }

  async listDrivers(tenantId: string) {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { tenantId, status: "ACTIVE", membershipRoles: { some: { role: { name: "Driver" } } } },
      select: { userId: true, user: { select: { fullName: true, phone: true } } },
      orderBy: { user: { fullName: "asc" } },
    });
    return memberships.map(({ userId, user }) => ({ id: userId, fullName: user.fullName, phone: user.phone }));
  }

  async myAssignedShipments(tenantId: string, userId: string) {
    const membership = await this.prisma.tenantMembership.findFirst({ where: { tenantId, userId, status: "ACTIVE", membershipRoles: { some: { role: { name: "Driver" } } } }, select: { id: true } });
    if (!membership) throw new ForbiddenException("This page is available to active Driver-role members");
    return this.prisma.shipment.findMany({
      where: { tenantId, assignedDriverId: userId, status: { notIn: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED, ShipmentStatus.RETURNED] } },
      select: { id: true, trackingNumber: true, status: true, recipientName: true, recipientPhone: true, recipientAddress: true, events: { orderBy: { sequence: "desc" }, take: 1, select: { occurredAt: true, note: true } } },
      orderBy: { updatedAt: "asc" },
    });
  }

  async assignDriver(tenantId: string, shipmentId: string, driverId: string, actorId: string) {
    const [shipment, driver] = await Promise.all([
      this.prisma.shipment.findFirst({ where: { id: shipmentId, tenantId }, select: { id: true, status: true } }),
      this.prisma.tenantMembership.findFirst({
        where: { tenantId, userId: driverId, status: "ACTIVE", membershipRoles: { some: { role: { name: "Driver" } } } },
        select: { user: { select: { fullName: true } } },
      }),
    ]);
    if (!shipment) throw new NotFoundException("Shipment not found");
    if (!driver) throw new BadRequestException("Choose an active team member with the Driver role");
    if (shipment.status !== ShipmentStatus.BOOKED && shipment.status !== ShipmentStatus.PICKUP_SCHEDULED) {
      throw new BadRequestException("A driver can only be assigned before collection");
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipment.updateMany({ where: { id: shipmentId, tenantId, status: shipment.status }, data: { assignedDriverId: driverId } });
      if (!updated.count) throw new ConflictException("Shipment changed while assigning the driver; refresh and try again");
      await tx.auditLog.create({ data: { tenantId, actorId, action: "shipment.driver.assigned", targetType: "shipment", targetId: shipmentId, metadata: { driverId, driverName: driver.user.fullName } } });
    });
    return { shipmentId, driverId, driverName: driver.user.fullName };
  }

  async deliver(tenantId: string, shipmentId: string, actorId: string, input: { recipientName: string; note?: string }) {
    const shipment = await this.prisma.shipment.findFirst({ where: { id: shipmentId, tenantId }, select: { id: true, status: true, assignedDriverId: true } });
    if (!shipment) throw new NotFoundException("Shipment not found");
    if (shipment.status === ShipmentStatus.DELIVERED) {
      const existing = await this.prisma.proofOfDelivery.findFirst({ where: { tenantId, shipmentId } });
      if (existing) return existing;
    }
    if (shipment.status !== ShipmentStatus.OUT_FOR_DELIVERY) throw new BadRequestException("Shipment must be out for delivery before proof can be recorded");
    await this.assertDriverAssignment(tenantId, actorId, shipment.assignedDriverId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipment.updateMany({ where: { id: shipmentId, tenantId, status: ShipmentStatus.OUT_FOR_DELIVERY }, data: { status: ShipmentStatus.DELIVERED } });
      if (!updated.count) throw new ConflictException("Shipment status changed; refresh and try again");
      const proof = await tx.proofOfDelivery.create({ data: { tenantId, shipmentId, recipientName: input.recipientName.trim(), note: input.note?.trim() || null, actorId } });
      const previousEvent = await tx.shipmentEvent.findFirst({ where: { tenantId, shipmentId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
      await tx.shipmentEvent.create({ data: { tenantId, shipmentId, sequence: (previousEvent?.sequence ?? 0) + 1, status: ShipmentStatus.DELIVERED, note: input.note?.trim() || "Proof of delivery recorded", actorId, source: "staff" } });
      await tx.auditLog.create({ data: { tenantId, actorId, action: "shipment.delivered", targetType: "proof_of_delivery", targetId: proof.id, metadata: { recipientName: proof.recipientName } } });
      return proof;
    });
  }

  async addEvent(tenantId: string, shipmentId: string, actorId: string, data: {
    status: ShipmentStatus; note?: string; location?: string;
  }) {
    const shipment = await this.prisma.shipment.findFirst({ where: { id: shipmentId, tenantId } });
    if (!shipment) throw new NotFoundException("Shipment not found");
    if (data.status === ShipmentStatus.DELIVERED) throw new BadRequestException("Record proof of delivery to complete a shipment");
    await this.assertDriverAssignment(tenantId, actorId, shipment.assignedDriverId);

    const allowed = ALLOWED_TRANSITIONS[shipment.status];
    if (!allowed.includes(data.status))
      throw new BadRequestException(
        `Cannot transition from ${shipment.status} to ${data.status}. Allowed: ${allowed.join(", ") || "none (terminal state)"}`,
      );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipment.updateMany({
        where: { id: shipmentId, tenantId, status: shipment.status },
        data: { status: data.status },
      });
      if (!updated.count) throw new ConflictException("Shipment status changed; refresh and try again");
      const previousEvent = await tx.shipmentEvent.findFirst({ where: { tenantId, shipmentId }, orderBy: { sequence: "desc" }, select: { sequence: true } });

      const event = await tx.shipmentEvent.create({
        data: {
          tenantId,
          shipmentId,
          sequence: (previousEvent?.sequence ?? 0) + 1,
          status: data.status,
          note: data.note,
          location: data.location,
          actorId,
          source: "staff",
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          action: "shipment.status.changed",
          targetType: "shipment",
          targetId: shipmentId,
          metadata: { from: shipment.status, to: data.status, eventId: event.id },
        },
      });

      return event;
    });
  }

  private async assertDriverAssignment(tenantId: string, actorId: string, assignedDriverId: string | null): Promise<void> {
    const driverMembership = await this.prisma.tenantMembership.findFirst({
      where: { tenantId, userId: actorId, status: "ACTIVE", membershipRoles: { some: { role: { name: "Driver" } } } },
      select: { id: true },
    });
    if (driverMembership && assignedDriverId !== actorId) {
      throw new ForbiddenException("Drivers can only update shipments assigned to them");
    }
  }

  async cancel(tenantId: string, id: string, actorId: string) {
    return this.addEvent(tenantId, id, actorId, {
      status: ShipmentStatus.CANCELLED,
      note: "Shipment cancelled",
    });
  }

  /** Public tracking — returns limited fields only */
  async findByTrackingNumber(trackingNumber: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { trackingNumber },
      select: {
        trackingNumber: true,
        status: true,
        serviceType: true,
        createdAt: true,
        events: {
          select: { status: true, location: true, occurredAt: true },
          orderBy: { occurredAt: "asc" },
        },
      },
    });
    if (!shipment) throw new NotFoundException("Shipment not found");
    return shipment;
  }
}

