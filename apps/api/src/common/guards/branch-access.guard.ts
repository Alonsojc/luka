import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { JwtPayload } from "../decorators/current-user.decorator";

@Injectable()
export class BranchAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    // Extract branchId from params, query, or body
    const branchId =
      request.params?.branchId ||
      request.query?.branchId ||
      request.body?.branchId ||
      request.headers["x-branch-id"];

    if (!branchId) {
      return true; // No branch context required
    }

    if (!user || !user.roles) {
      throw new ForbiddenException("Acceso denegado");
    }

    // org-wide roles (branchId is null) can access any branch
    const hasAccess = user.roles.some(
      (r) => r.branchId === null || r.branchId === branchId
    );

    if (!hasAccess) {
      throw new ForbiddenException(
        "No tienes acceso a esta sucursal"
      );
    }

    // Store branchId in request for controllers
    request.branchId = branchId;
    return true;
  }
}
