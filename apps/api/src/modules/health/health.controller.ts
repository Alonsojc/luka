import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CacheService } from "../../common/cache/cache.service";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  @Get()
  async check() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "0.0.1",
    };
  }

  @Get("detailed")
  async detailed() {
    const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

    // Database check
    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: "ok", latency: Date.now() - dbStart };
    } catch (err: any) {
      checks.database = { status: "error", latency: Date.now() - dbStart, error: err.message };
    }

    // Redis check
    const redisStart = Date.now();
    try {
      await this.cache.set("health:ping", "pong", 10);
      const result = await this.cache.get<string>("health:ping");
      checks.redis = {
        status: result === "pong" ? "ok" : "degraded",
        latency: Date.now() - redisStart,
      };
    } catch (err: any) {
      checks.redis = { status: "error", latency: Date.now() - redisStart, error: err.message };
    }

    // Memory usage
    const mem = process.memoryUsage();

    const allOk = Object.values(checks).every((c) => c.status === "ok");

    return {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: process.env.npm_package_version || "0.0.1",
      checks,
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
      environment: process.env.NODE_ENV || "development",
    };
  }

  @Get("ready")
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ready" };
    } catch {
      return { status: "not_ready" };
    }
  }
}
