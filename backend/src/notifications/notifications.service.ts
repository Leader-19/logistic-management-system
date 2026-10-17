import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { NotificationsRepository } from "./repositories/notifications.repository";
import { PaginationDto, paginate } from "../common/dto/pagination.dto";
@Injectable()
export class NotificationsService {
  constructor(private readonly repository: NotificationsRepository) {}
  createForUser(tenantId: string, userId: string, title: string, body: string, href?: string) {
    if (!title.trim() || title.length > 160 || !body.trim() || body.length > 1000) throw new BadRequestException("Notification title/body is outside supported limits");
    if (href && (!href.startsWith("/") || href.startsWith("//") || href.includes("\\"))) throw new BadRequestException("Notification links must stay within this workspace");
    return this.repository.create(tenantId, userId, title.trim(), body.trim(), href);
  }  async list(tenantId: string, userId: string, pagination: PaginationDto) {
    const result = await this.repository.list(tenantId, userId, pagination);
    return { ...paginate(result.data, result.total, pagination), unread: result.unread };
  }
  async markRead(tenantId: string, userId: string, id: string) {
    const notification = await this.repository.find(tenantId, userId, id);
    if (!notification) throw new NotFoundException("Notification not found");
    if (!notification.readAt) await this.repository.markRead(tenantId, userId, id);
    return { id, read: true };
  }
}

