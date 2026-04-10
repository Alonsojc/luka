import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import { join } from "path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Next.js handles CSP
      crossOriginEmbedderPolicy: false, // Allow loading resources
    })
  );

  // Serve uploaded files statically
  app.useStaticAssets(join(__dirname, "..", "uploads"), { prefix: "/uploads/" });

  app.setGlobalPrefix("api");
  const webUrl = process.env.WEB_URL || "http://localhost:3002";
  app.enableCors({
    origin: [webUrl, "http://localhost:3002"],
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

  const config = new DocumentBuilder()
    .setTitle("Luka System API")
    .setDescription("ERP para cadena de pokes")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  const port = process.env.API_PORT || 3001;
  await app.listen(port);
  console.log(`Luka API running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
