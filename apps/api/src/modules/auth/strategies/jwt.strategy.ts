import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Request } from "express";
import { JwtPayload } from "../../../common/decorators/current-user.decorator";
import { ACCESS_COOKIE_NAME } from "../../../common/config/cookie.config";
import { getJwtSecret } from "../jwt-config";

/**
 * Extract JWT from the httpOnly cookie first, then fall back to
 * the Authorization: Bearer header for backward compatibility
 * (e.g. API-key integrations or mobile clients).
 */
function extractJwt(req: Request): string | null {
  const fromCookie = req?.cookies?.[ACCESS_COOKIE_NAME];
  if (fromCookie) return fromCookie;
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: extractJwt,
      ignoreExpiration: false,
      secretOrKey: getJwtSecret("JWT_SECRET"),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    return payload;
  }
}
