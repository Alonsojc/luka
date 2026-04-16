import { describe, it, expect, beforeEach } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CacheService } from "../../common/cache/cache.service";

const mockPrisma = {
  $queryRaw: async () => [{ "?column?": 1 }],
};

const mockCache = {
  get: async () => "pong",
  set: async () => undefined,
  del: async () => undefined,
};

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should return ok status with timestamp", async () => {
    const result = await controller.check();

    expect(result).toEqual({
      status: "ok",
      timestamp: expect.any(String),
      uptime: expect.any(Number),
      version: expect.any(String),
    });
  });

  it("should return a valid ISO date string in timestamp", async () => {
    const result = await controller.check();

    const parsed = new Date(result.timestamp);
    expect(parsed.toISOString()).toBe(result.timestamp);
  });
});
