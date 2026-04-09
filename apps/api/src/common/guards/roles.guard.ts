import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY, PERMISSIONS_KEY } from "../decorators/roles.decorator";
import { JwtPayload } from "../decorators/current-user.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles && !requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user || !user.roles) {
      throw new ForbiddenException("Acceso denegado");
    }

    // Check role names
    if (requiredRoles) {
      const hasRole = user.roles.some((r) =>
        requiredRoles.includes(r.roleName)
      );
      if (!hasRole) {
        throw new ForbiddenException("No tienes el rol requerido");
      }
    }

    // Check permissions
    if (requiredPermissions) {
      const userPermissions = user.roles.flatMap((r) => r.permissions);
      const hasPermission = requiredPermissions.every((p) =>
        userPermissions.includes(p)
      );
      if (!hasPermission) {
        throw new ForbiddenException("No tienes los permisos requeridos");
      }
    }

    return true;
  }
}
