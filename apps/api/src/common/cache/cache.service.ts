import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis;

  async onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    try {
      await this.client.connect();
      this.logger.log("Redis cache connected");
    } catch (err) {
      this.logger.warn(`Redis cache unavailable — caching disabled: ${err}`);
    }
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => {});
  }

  /** Get a cached value. Returns null on miss or if Redis is down. */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /** Set a cached value with TTL in seconds. */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // Cache write failure is non-critical
    }
  }

  /** Delete a cached key (or pattern via invalidatePattern). */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch {
      // Non-critical
    }
  }

  /** Invalidate all keys matching a prefix (e.g. "products:org123:*"). */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch {
      // Non-critical
    }
  }
}
