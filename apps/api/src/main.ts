import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Logger, ValidationPipe, VERSION_NEUTRAL, VersioningType } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { json, urlencoded } from "express";
import { join } from "path";
import { AppModule } from "./app.module";
import { validateEnvironment } from "./common/config/env.validation";

async function bootstrap() {
  validateEnvironment();

  const isProduction = process.env.NODE_ENV === "production";

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // JSON-formatted logs in production for ELK/Datadog/CloudWatch parsing
    logger: isProduction ? ["error", "warn", "log"] : ["error", "warn", "log", "debug", "verbose"],
  });

  const logger = new Logger("Bootstrap");

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Next.js handles CSP via meta tags
      crossOriginEmbedderPolicy: false, // Allow loading resources cross-origin
    }),
  );

  // Cookie parsing (for httpOnly auth cookies)
  app.use(cookieParser());

  // Request body size limits
  app.use(json({ limit: "5mb" }));
  app.use(urlencoded({ extended: true, limit: "5mb" }));

  // Serve uploaded files statically
  app.useStaticAssets(join(__dirname, "..", "uploads"), { prefix: "/uploads/" });

  app.setGlobalPrefix("api");

  // API versioning — URI-based (e.g. /api/v1/compras/...)
  // Existing controllers are VERSION_NEUTRAL and respond to /api/compras/...
  // New versioned controllers use @Controller({ version: '1', path: 'resource' })
  // and respond to /api/v1/resource/...
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: VERSION_NEUTRAL,
    prefix: "v",
  });

  // CORS — environment-specific origins only
  const webUrl = process.env.WEB_URL || "http://localhost:3002";
  const corsOrigins = isProduction ? [webUrl] : [webUrl, "http://localhost:3002"];

  app.enableCors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    credentials: true,
    maxAge: 3600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger API docs — disabled in production
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle("Luka System API")
      .setDescription("ERP para cadena de pokes")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = process.env.API_PORT || 3001;
  await app.listen(port);
  logger.log(`Luka API running on http://localhost:${port}`);
  if (!isProduction) {
    logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
