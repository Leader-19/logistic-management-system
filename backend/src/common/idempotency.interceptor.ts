import { BadRequestException, ConflictException, Injectable, NestInterceptor, type CallHandler, type ExecutionContext } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { catchError, concatMap, from, Observable, of, throwError } from "rxjs";
import { hashIdempotentRequest, isValidIdempotencyKey, requiresIdempotencyKey } from "./idempotency.utils";
import { PrismaService } from "./prisma.service";

type IdempotentRequest = Request & {
  user?: { sub?: string };
  tenantId?: string;
};

const KEY_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private operationsSinceCleanup = 0;

  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<IdempotentRequest>();
    const response = http.getResponse<Response>();
    if (!requiresIdempotencyKey(request.method, request.path)) return next.handle();

    const key = request.get("Idempotency-Key");
    if (!key || !isValidIdempotencyKey(key)) {
      throw new BadRequestException("A valid Idempotency-Key header (16–128 letters, digits, or . _ : -) is required");
    }
    const actorId = request.user?.sub;
    if (!actorId || !/^[0-9a-f-]{36}$/i.test(actorId)) throw new BadRequestException("Authenticated actor is required for an idempotent operation");

    const scopeKey = request.tenantId ?? "platform";
    const requestHash = hashIdempotentRequest(request);
    const unique = { scopeKey_actorId_key: { scopeKey, actorId, key } };
    const now = new Date();
    this.operationsSinceCleanup += 1;
    if (this.operationsSinceCleanup >= 100) {
      this.operationsSinceCleanup = 0;
      void this.prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => undefined);
    }
    const prior = await this.prisma.idempotencyRecord.findUnique({ where: unique });

    if (prior && prior.expiresAt > now) {
      if (prior.requestHash !== requestHash) throw new ConflictException("This Idempotency-Key was already used with a different request");
      if (!prior.completedAt || prior.responseBody === null) throw new ConflictException("A request with this Idempotency-Key is still being processed; retry shortly");
      response.status(prior.responseStatus ?? 200);
      return of(prior.responseBody);
    }
    if (prior) await this.prisma.idempotencyRecord.delete({ where: unique });

    try {
      await this.prisma.idempotencyRecord.create({
        data: { scopeKey, actorId, key, requestHash, expiresAt: new Date(now.getTime() + KEY_TTL_MS) },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A request with this Idempotency-Key is already being processed; retry shortly");
      }
      throw error;
    }

    return next.handle().pipe(
      concatMap(body => from(this.prisma.idempotencyRecord.update({
        where: unique,
        data: {
          responseBody: body === null ? Prisma.JsonNull : JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue,
          responseStatus: response.statusCode,
          completedAt: new Date(),
        },
      })).pipe(concatMap(() => of(body)))),
      catchError(error => from(this.prisma.idempotencyRecord.deleteMany({ where: { scopeKey, actorId, key } })).pipe(
        concatMap(() => throwError(() => error)),
        catchError(() => throwError(() => error)),
      )),
    );
  }
}
