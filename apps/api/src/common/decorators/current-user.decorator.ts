import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
  roles: Array<{
    branchId: string | null;
    roleName: string;
    permissions: string[];
  }>;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;
    return data ? user?.[data] : user;
  },
);
