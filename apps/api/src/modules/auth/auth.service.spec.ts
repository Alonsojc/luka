import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { AuditService } from "../audit/audit.service";

vi.mock("bcryptjs", () => ({
  compare: vi.fn(),
  hash: vi.fn().mockResolvedValue("hashed_password"),
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue("hashed_password"),
  },
}));

vi.mock("crypto", () => ({
  randomUUID: vi.fn().mockReturnValue("mock-uuid"),
  default: {
    randomUUID: vi.fn().mockReturnValue("mock-uuid"),
  },
}));

import * as bcrypt from "bcryptjs";

describe("AuthService", () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockJwtService: any;

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
    };

    mockJwtService = {
      sign: vi.fn().mockReturnValue("mock_token"),
      verify: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        {
          provide: EmailService,
          useValue: { sendPasswordReset: vi.fn(), sendWelcomeEmail: vi.fn() },
        },
        { provide: AuditService, useValue: { log: vi.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("login", () => {
    const mockUser = {
      id: "user-1",
      email: "test@test.com",
      passwordHash: "hashed_pw",
      isActive: true,
      firstName: "Test",
      lastName: "User",
      organizationId: "org-1",
      branchRoles: [
        {
          branchId: null,
          role: { name: "admin", permissions: ["all"] },
        },
      ],
    };

    it("should throw UnauthorizedException when user is not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login("bad@email.com", "password")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException when user is inactive", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(service.login("test@test.com", "password")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException for wrong password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(service.login("test@test.com", "wrong")).rejects.toThrow(UnauthorizedException);
    });

    it("should return accessToken, refreshToken, and user for valid credentials", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.login("test@test.com", "password");

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result).toHaveProperty("user");
      expect(result.user.email).toBe("test@test.com");
      expect(result.user.id).toBe("user-1");
    });

    it("should update lastLogin on successful login", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      mockPrisma.user.update.mockResolvedValue({});

      await service.login("test@test.com", "password");

      // First update call is lastLogin, second is refreshToken hash
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.user.update).toHaveBeenNthCalledWith(1, {
        where: { id: "user-1" },
        data: { lastLogin: expect.any(Date) },
      });
    });
  });

  describe("createUser", () => {
    it("should throw ConflictException when email already exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "existing-user" });

      await expect(
        service.createUser("org-1", {
          email: "taken@test.com",
          password: "pass123",
          firstName: "New",
          lastName: "User",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("should create user with hashed password when email is new", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: "new-user",
        email: "new@test.com",
        firstName: "New",
        lastName: "User",
        createdAt: new Date(),
      });

      const result = await service.createUser("org-1", {
        email: "new@test.com",
        password: "pass123",
        firstName: "New",
        lastName: "User",
      });

      expect(result).toHaveProperty("id", "new-user");
      expect(bcrypt.hash).toHaveBeenCalledWith("pass123", 12);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: "org-1",
          email: "new@test.com",
          passwordHash: "hashed_password",
        }),
        select: expect.any(Object),
      });
    });
  });

  describe("logout", () => {
    it("should clear the refresh token", async () => {
      mockPrisma.user.update.mockResolvedValue({});

      await service.logout("user-1");

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { refreshToken: null },
      });
    });
  });

  describe("forgotPassword", () => {
    it("should return generic message regardless of whether user exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword("nobody@test.com");

      expect(result).toEqual({
        message: "Si el email existe, recibirás instrucciones",
      });
    });

    it("should set resetToken and resetTokenExpiry for existing user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "exists@test.com",
      });
      mockPrisma.user.update.mockResolvedValue({});

      await service.forgotPassword("exists@test.com");

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          resetToken: "mock-uuid",
          resetTokenExpiry: expect.any(Date),
        },
      });
    });
  });
});
