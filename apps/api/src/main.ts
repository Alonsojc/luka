import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import { json, urlencoded } from "express";
import { join } from "path";
import { AppModule } from "./app.module";
import { validateEnvironment } from "./common/config/env.validation";

async function bootstrap() {
  validateEnvironment();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const isProduction = process.env.NODE_ENV === "production";

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Next.js handles CSP via meta tags
      crossOriginEmbedderPolicy: false, // Allow loading resources cross-origin
    })
  );

  // Request body size limits
  app.use(json({ limit: "5mb" }));
  app.use(urlencoded({ extended: true, limit: "5mb" }));

  // Serve uploaded files statically
  app.useStaticAssets(join(__dirname, "..", "uploads"), { prefix: "/uploads/" });

  app.setGlobalPrefix("api");

  // CORS — environment-specific origins only
  const webUrl = process.env.WEB_URL || "http://localhost:3002";
  const corsOrigins = isProduction
    ? [webUrl]
    : [webUrl, "http://localhost:3002"];

  app.enableCors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 3600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
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
  console.log(`Luka API running on http://localhost:${port}`);
  if (!isProduction) {
    console.log(`Swagger docs at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
