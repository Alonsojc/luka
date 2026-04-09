import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers["x-api-key"];
    const expectedKey = process.env.CORNTECH_API_KEY;

    if (!expectedKey) {
      // If no key configured, allow (dev mode)
      return true;
    }

    if (!apiKey || apiKey !== expectedKey) {
      throw new UnauthorizedException("Invalid API key");
    }

    return true;
  }
}
