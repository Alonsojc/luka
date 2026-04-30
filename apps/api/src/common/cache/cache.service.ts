import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis | null = null;
  private available = false;

  private isDisabled() {
    return process.env.CACHE_MODE === "disabled" || process.env.DISABLE_CACHE === "true";
  }

  private disableCache() {
    this.available = false;
    this.client?.disconnect();
  }

  async onModuleInit() {
    if (this.isDisabled()) {
      this.logger.log("Redis cache disabled");
      return;
    }

    this.client = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    this.client.on("error", () => {});

    try {
      await this.client.connect();
      this.available = true;
      this.logger.log("Redis cache connected");
    } catch (err) {
      this.disableCache();
      this.logger.warn(`Redis cache unavailable — caching disabled: ${err}`);
    }
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => {});
  }

  /** Get a cached value. Returns null on miss or if Redis is down. */
  async get<T>(key: string): Promise<T | null> {
    if (!this.available || !this.client) return null;
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      this.disableCache();
      return null;
    }
  }

  /** Set a cached value with TTL in seconds. */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.available || !this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      this.disableCache();
    }
  }

  /** Delete a cached key (or pattern via invalidatePattern). */
  async del(key: string): Promise<void> {
    if (!this.available || !this.client) return;
    try {
      await this.client.del(key);
    } catch {
      this.disableCache();
    }
  }

  /** Invalidate all keys matching a prefix (e.g. "products:org123:*"). */
  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.available || !this.client) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch {
      this.disableCache();
    }
  }
}
