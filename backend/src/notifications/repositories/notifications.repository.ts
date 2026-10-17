import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { PaginationDto } from "../../common/dto/pagination.dto";
type NotificationRow = { id: string; title: string; body: string; href: string | null; readAt: Date | null; createdAt: Date };
@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}
  async list(tenantId: string, userId: string, pagination: PaginationDto) {
    const [data, totals] = await Promise.all([
      this.prisma.$queryRaw<NotificationRow[]>`SELECT id, title, body, href, read_at AS "readAt", created_at AS "createdAt" FROM notifications WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}::uuid ORDER BY created_at DESC LIMIT ${pagination.limit} OFFSET ${pagination.skip}`,
      this.prisma.$queryRaw<Array<{ total: bigint; unread: bigint }>>`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE read_at IS NULL) AS unread FROM notifications WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}::uuid`,
    ]);
    return { data, total: Number(totals[0]?.total ?? 0), unread: Number(totals[0]?.unread ?? 0) };
  }
  async create(tenantId: string, userId: string, title: string, body: string, href?: string) {
    const rows = await this.prisma.$queryRaw<NotificationRow[]>`INSERT INTO notifications (tenant_id, user_id, title, body, href) VALUES (${tenantId}::uuid, ${userId}::uuid, ${title}, ${body}, ${href ?? null}) RETURNING id, title, body, href, read_at AS "readAt", created_at AS "createdAt"`;
    return rows[0];
  }  async find(tenantId: string, userId: string, id: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; readAt: Date | null }>>`SELECT id, read_at AS "readAt" FROM notifications WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}::uuid AND id = ${id}::uuid LIMIT 1`;
    return rows[0] ?? null;
  }
  markRead(tenantId: string, userId: string, id: string) {
    return this.prisma.$executeRaw`UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}::uuid AND id = ${id}::uuid AND read_at IS NULL`;
  }
}


