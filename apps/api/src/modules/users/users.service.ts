import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../common/prisma/prisma.service";
import { JwtPayload } from "../../common/decorators/current-user.decorator";
import { EmailService } from "../email/email.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private auditService: AuditService,
  ) {}

  private assertAdminOrOwner(caller: JwtPayload) {
    const allowed = caller.roles.some(
      (r) =>
        r.roleName.toUpperCase() === "OWNER" ||
        r.roleName.toUpperCase() === "ADMIN",
    );
    if (!allowed) {
      throw new ForbiddenException(
        "Solo OWNER o ADMIN pueden gestionar usuarios",
      );
    }
  }

  async findAll(caller: JwtPayload) {
    this.assertAdminOrOwner(caller);

    const allUsers = await this.prisma.user.findMany({
      where: { organizationId: caller.organizationId },
      include: {
        branchRoles: {
          include: {
            role: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { firstName: "asc" },
    });

    // Exclude sensitive fields
    return allUsers.map(({ passwordHash, refreshToken, ...u }) => u);
  }

  async findOne(caller: JwtPayload, id: string) {
    this.assertAdminOrOwner(caller);

    const foundUser = await this.prisma.user.findFirst({
      where: { id, organizationId: caller.organizationId },
      include: {
        branchRoles: {
          include: {
            role: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!foundUser) {
      throw new NotFoundException("Usuario no encontrado");
    }

    // Exclude sensitive fields
    const { passwordHash, refreshToken, ...safeUser } = foundUser;
    return safeUser;
  }

  async create(
    caller: JwtPayload,
    data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone?: string;
      role: string;
      branchId?: string;
    },
  ) {
    this.assertAdminOrOwner(caller);

    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new ConflictException("El email ya esta registrado");
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    // Find or create the role within the organization
    let role = await this.prisma.role.findFirst({
      where: {
        organizationId: caller.organizationId,
        name: data.role,
      },
    });

    if (!role) {
      role = await this.prisma.role.create({
        data: {
          organizationId: caller.organizationId,
          name: data.role,
          isSystem: true,
          permissions: [],
        },
      });
    }

    const created = await this.prisma.user.create({
      data: {
        organizationId: caller.organizationId,
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        branchRoles: {
          create: {
            roleId: role.id,
            branchId: data.branchId || null,
          },
        },
      },
      include: {
        branchRoles: {
          include: {
            role: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });

    const { passwordHash: _ph, refreshToken: _rt, ...safeCreated } = created;

    this.emailService.sendWelcome(data.email, data.firstName);

    await this.auditService.log({
      organizationId: caller.organizationId,
      userId: caller.sub,
      userName: caller.email,
      action: "CREATE",
      module: "USERS",
      entityType: "User",
      entityId: created.id,
      description: `Usuario ${data.email} creado con rol ${data.role}`,
    });

    return safeCreated;
  }

  async update(
    caller: JwtPayload,
    id: string,
    data: {
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      role?: string;
      branchId?: string;
      isActive?: boolean;
    },
  ) {
    this.assertAdminOrOwner(caller);

    const existing = await this.prisma.user.findFirst({
      where: { id, organizationId: caller.organizationId },
      include: { branchRoles: true },
    });
    if (!existing) {
      throw new NotFoundException("Usuario no encontrado");
    }

    // Check email uniqueness if changing
    if (data.email && data.email !== existing.email) {
      const emailTaken = await this.prisma.user.findUnique({
        where: { email: data.email },
      });
      if (emailTaken) {
        throw new ConflictException("El email ya esta registrado");
      }
    }

    // Update user basic fields
    await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.email !== undefined && { email: data.email }),
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    // Update role assignment if role changed
    if (data.role !== undefined) {
      let role = await this.prisma.role.findFirst({
        where: {
          organizationId: caller.organizationId,
          name: data.role,
        },
      });
      if (!role) {
        role = await this.prisma.role.create({
          data: {
            organizationId: caller.organizationId,
            name: data.role,
            isSystem: true,
            permissions: [],
          },
        });
      }

      // Remove existing branch roles and create new one
      await this.prisma.userBranchRole.deleteMany({
        where: { userId: id },
      });

      await this.prisma.userBranchRole.create({
        data: {
          userId: id,
          roleId: role.id,
          branchId: data.branchId !== undefined ? data.branchId || null : null,
        },
      });
    } else if (data.branchId !== undefined) {
      // Only branch changed, update existing role assignments
      const currentRoles = existing.branchRoles;
      if (currentRoles.length > 0) {
        await this.prisma.userBranchRole.deleteMany({
          where: { userId: id },
        });
        for (const br of currentRoles) {
          await this.prisma.userBranchRole.create({
            data: {
              userId: id,
              roleId: br.roleId,
              branchId: data.branchId || null,
            },
          });
        }
      }
    }

    // Build changes object for audit
    const changes: Record<string, { old: any; new: any }> = {};
    if (data.email !== undefined && data.email !== existing.email)
      changes.email = { old: existing.email, new: data.email };
    if (data.firstName !== undefined && data.firstName !== existing.firstName)
      changes.firstName = { old: existing.firstName, new: data.firstName };
    if (data.lastName !== undefined && data.lastName !== existing.lastName)
      changes.lastName = { old: existing.lastName, new: data.lastName };
    if (data.isActive !== undefined && data.isActive !== existing.isActive)
      changes.isActive = { old: existing.isActive, new: data.isActive };

    await this.auditService.log({
      organizationId: caller.organizationId,
      userId: caller.sub,
      userName: caller.email,
      action: "UPDATE",
      module: "USERS",
      entityType: "User",
      entityId: id,
      description: `Usuario ${existing.email} actualizado`,
      changes: Object.keys(changes).length > 0 ? changes : undefined,
    });

    return this.findOne(caller, id);
  }

  async changePassword(
    caller: JwtPayload,
    id: string,
    newPassword: string,
  ) {
    this.assertAdminOrOwner(caller);

    const existing = await this.prisma.user.findFirst({
      where: { id, organizationId: caller.organizationId },
    });
    if (!existing) {
      throw new NotFoundException("Usuario no encontrado");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    return { message: "Contrasena actualizada" };
  }

  async softDelete(caller: JwtPayload, id: string) {
    this.assertAdminOrOwner(caller);

    const existing = await this.prisma.user.findFirst({
      where: { id, organizationId: caller.organizationId },
    });
    if (!existing) {
      throw new NotFoundException("Usuario no encontrado");
    }

    // Prevent self-deactivation
    if (id === caller.sub) {
      throw new ForbiddenException("No puedes desactivar tu propia cuenta");
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditService.log({
      organizationId: caller.organizationId,
      userId: caller.sub,
      userName: caller.email,
      action: "DELETE",
      module: "USERS",
      entityType: "User",
      entityId: id,
      description: `Usuario ${existing.email} desactivado`,
    });

    return { message: "Usuario desactivado" };
  }
}
