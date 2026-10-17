import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, catchError, from, map, mergeMap, throwError } from "rxjs";
import { AuthenticatedRequest } from "../common/interfaces";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class PlatformAuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & {
      baseUrl: string;
      path: string;
      method: string;
      ip: string;
      route?: { path?: string };
      get(name: string): string | undefined;
    }>();
    const supportSession = request.platformSupportSession;
    const isPlatformRoute = request.platformAdmin === true;
    if (!supportSession && !isPlatformRoute) return next.handle();
    const routePath = `${request.baseUrl ?? ""}${request.route?.path ?? request.path}`;

    const record = (outcome: "success" | "failure") => this.prisma.auditLog.create({
      data: {
        tenantId: supportSession?.tenantId ?? null,
        actorId: request.user.sub,
        action: supportSession ? "platform.support.request" : "platform.admin.request",
        targetType: "http_request",
        targetId: routePath.slice(0, 255),
        outcome,
        metadata: {
          method: request.method,
          path: routePath,
          supportSessionId: supportSession?.id ?? null,
          reason: supportSession?.reason ?? null,
        },
        ipAddress: request.ip,
        userAgent: request.get("user-agent")?.slice(0, 500),
      },
    }).then(() => undefined);

    return next.handle().pipe(
      mergeMap((result) => from(record("success")).pipe(map(() => result))),
      catchError((error: unknown) => from(record("failure")).pipe(mergeMap(() => throwError(() => error)))),
    );
  }
}
