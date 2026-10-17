import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { AuthenticatedRequest } from "../common/interfaces";

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { platformAdmin?: boolean }>();
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { id: true, isActive: true, isPlatformAdmin: true },
    });
    if (!user?.isActive || !user.isPlatformAdmin) throw new ForbiddenException("Platform administrator access required");
    request.platformAdmin = true;
    return true;
  }
}
