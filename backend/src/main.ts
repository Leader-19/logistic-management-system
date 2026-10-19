import { config } from "dotenv";
import { resolve } from "node:path";
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { createRateLimitMiddleware } from "./common/rate-limit.middleware";
import { createRequestContextMiddleware } from "./common/request-context.middleware";

config({ path: resolve(__dirname, "../../.env") });

async function bootstrap() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("Set JWT_SECRET to a random value of at least 32 characters in the root .env file");
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.use(createRequestContextMiddleware());
  app.use(createRateLimitMiddleware());
  app.useBodyParser("json", { limit: "1mb", verify: (request, _response, buffer) => { (request as typeof request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } });
  app.useBodyParser("urlencoded", { limit: "1mb", extended: true });
  app.use((_request: unknown, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Resource-Policy", "same-site");
    if (process.env.NODE_ENV === "production") response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });

  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "x-tenant-id", "x-platform-support-session", "Idempotency-Key", "x-request-id"],
    exposedHeaders: ["Retry-After", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "X-Request-Id"],
    credentials: false,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  const swagger = new DocumentBuilder()
    .setTitle("Logistics Management API")
    .setDescription("Multi-tenant SaaS Logistics Management System API")
    .setVersion("1.0")
    .addBearerAuth()
    .addApiKey({ type: "apiKey", name: "x-tenant-id", in: "header" }, "x-tenant-id")
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}/api/v1`);
  console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
