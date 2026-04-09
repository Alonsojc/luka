import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import {
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { AuditService } from "../audit/audit.service";
import type { JwtPayload } from "../../common/decorators/current-user.decorator";

vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("hashed_password"),
  default: {
    hash: vi.fn().mockResolvedValue("hashed_password"),
  },
}));

describe("UsersService", () => {
  let service: UsersService;
  let mockPrisma: any;

  const adminCaller: JwtPayload = {
    sub: "admin-1",
    email: "admin@test.com",
    organizationId: "org-1",
    roles: [{ branchId: null, roleName: "ADMIN", permissions: ["all"] }],
  };

  const ownerCaller: JwtPayload = {
    sub: "owner-1",
    email: "owner@test.com",
    organizationId: "org-1",
    roles: [{ branchId: null, roleName: "owner", permissions: ["all"] }],
  };

  const employeeCaller: JwtPayload = {
    sub: "emp-1",
    email: "emp@test.com",
    organizationId: "org-1",
    roles: [{ branchId: "b1", roleName: "employee", permissions: [] }],
  };

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      role: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      userBranchRole: {
        deleteMany: vi.fn(),
        create: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: { sendWelcome: vi.fn(), sendWelcomeEmail: vi.fn() } },
        { provide: AuditService, useValue: { log: vi.fn() } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findAll", () => {
    it("should return users without passwordHash and refreshToken", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: "u1",
          email: "user1@test.com",
          firstName: "User",
          lastName: "One",
          passwordHash: "secret_hash",
          refreshToken: "secret_token",
          organizationId: "org-1",
          branchRoles: [],
        },
        {
          id: "u2",
          email: "user2@test.com",
          firstName: "User",
          lastName: "Two",
          passwordHash: "another_hash",
          refreshToken: null,
          organizationId: "org-1",
          branchRoles: [],
        },
      ]);

      const result = await service.findAll(adminCaller);

      expect(result).toHaveLength(2);
      for (const user of result) {
        expect(user).not.toHaveProperty("passwordHash");
        expect(user).not.toHaveProperty("refreshToken");
        expect(user).toHaveProperty("id");
        expect(user).toHaveProperty("email");
      }
    });

    it("should throw ForbiddenException for non-admin/non-owner callers", async () => {
      await expect(service.findAll(employeeCaller)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should allow OWNER role (case-insensitive)", async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      // ownerCaller has roleName "owner" (lowercase) - should still be allowed
      const result = await service.findAll(ownerCaller);
      expect(result).toEqual([]);
    });
  });

  describe("create", () => {
    it("should throw ConflictException for duplicate email", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "existing-user" });

      await expect(
        service.create(adminCaller, {
          email: "taken@test.com",
          password: "pass123",
          firstName: "New",
          lastName: "User",
          role: "employee",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("should create user and assign role", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockResolvedValue({
        id: "role-1",
        name: "employee",
      });
      mockPrisma.user.create.mockResolvedValue({
        id: "new-user",
        email: "new@test.com",
        firstName: "New",
        lastName: "User",
        organizationId: "org-1",
        passwordHash: "hashed",
        refreshToken: null,
        branchRoles: [
          { roleId: "role-1", role: { name: "employee" }, branch: null },
        ],
      });

      const result = await service.create(adminCaller, {
        email: "new@test.com",
        password: "pass123",
        firstName: "New",
        lastName: "User",
        role: "employee",
      });

      expect(result).toHaveProperty("id", "new-user");
      expect(result).not.toHaveProperty("passwordHash");
      expect(result).not.toHaveProperty("refreshToken");
    });
  });

  describe("softDelete", () => {
    it("should throw ForbiddenException when trying to self-deactivate", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: "admin-1",
        organizationId: "org-1",
      });

      await expect(service.softDelete(adminCaller, "admin-1")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should deactivate another user successfully", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: "user-2",
        organizationId: "org-1",
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.softDelete(adminCaller, "user-2");

      expect(result).toEqual({ message: "Usuario desactivado" });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-2" },
        data: { isActive: false },
      });
    });

    it("should throw NotFoundException if user not found", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.softDelete(adminCaller, "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("findOne", () => {
    it("should return user without sensitive fields", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: "u1",
        email: "user@test.com",
        firstName: "Test",
        lastName: "User",
        passwordHash: "secret",
        refreshToken: "refresh_secret",
        branchRoles: [],
      });

      const result = await service.findOne(adminCaller, "u1");

      expect(result).not.toHaveProperty("passwordHash");
      expect(result).not.toHaveProperty("refreshToken");
      expect(result).toHaveProperty("email", "user@test.com");
    });

    it("should throw NotFoundException if user not found", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(adminCaller, "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
