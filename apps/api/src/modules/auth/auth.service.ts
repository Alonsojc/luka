import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { JwtPayload } from "../../common/decorators/current-user.decorator";
import { EmailService } from "../email/email.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private auditService: AuditService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        branchRoles: {
          include: { role: true },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      roles: user.branchRoles.map((br) => ({
        branchId: br.branchId,
        roleName: br.role.name,
        permissions: br.role.permissions as string[],
      })),
    };

    const accessToken = this.jwtService.sign(payload as any);
    const refreshToken = this.jwtService.sign(payload as any, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: (process.env.JWT_REFRESH_EXPIRATION || "7d") as any,
    });

    // Store refresh token hash
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(refreshToken, 10) },
    });

    await this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      action: "LOGIN",
      module: "AUTH",
      description: `Inicio de sesion: ${user.email}`,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        organizationId: user.organizationId,
        roles: payload.roles,
      },
    };
  }

  async refresh(refreshToken: string) {
    let decoded: JwtPayload;
    try {
      decoded = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("Token de refresco inválido");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: decoded.sub },
      include: {
        branchRoles: { include: { role: true } },
      },
    });

    if (!user || !user.isActive || !user.refreshToken) {
      throw new UnauthorizedException("Token de refresco inválido");
    }

    const isValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isValid) {
      throw new UnauthorizedException("Token de refresco inválido");
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      roles: user.branchRoles.map((br) => ({
        branchId: br.branchId,
        roleName: br.role.name,
        permissions: br.role.permissions as string[],
      })),
    };

    return {
      accessToken: this.jwtService.sign(payload as any),
    };
  }

  async createUser(
    organizationId: string,
    data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone?: string;
    }
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new ConflictException("El email ya está registrado");
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    return this.prisma.user.create({
      data: {
        organizationId,
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    });
  }

  async logout(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true, email: true, firstName: true, lastName: true },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    if (user) {
      await this.auditService.log({
        organizationId: user.organizationId,
        userId,
        userName: `${user.firstName} ${user.lastName}`.trim() || user.email,
        action: "LOGOUT",
        module: "AUTH",
        description: `Cierre de sesion: ${user.email}`,
      });
    }
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      const token = crypto.randomUUID();
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken: token,
          resetTokenExpiry: expiry,
        },
      });

      const resetUrl = `${process.env.WEB_URL || "http://localhost:3002"}/reset-password?token=${token}`;
      this.emailService.sendPasswordReset(email, resetUrl);
    }

    return { message: "Si el email existe, recibirás instrucciones" };
  }

  async resetPassword(token: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException("Token inválido o expirado");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    return { message: "Contraseña actualizada exitosamente" };
  }
}
