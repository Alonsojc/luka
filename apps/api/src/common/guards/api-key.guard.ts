import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers["x-api-key"];
    const expectedKey = process.env.CORNTECH_API_KEY;

    if (!expectedKey) {
      if (process.env.NODE_ENV === "production") {
        this.logger.error("CORNTECH_API_KEY not configured — rejecting request");
        throw new UnauthorizedException("API key not configured");
      }
      // Allow in development only
      return true;
    }

    if (!apiKey || apiKey !== expectedKey) {
      throw new UnauthorizedException("Invalid API key");
    }

    return true;
  }
}
