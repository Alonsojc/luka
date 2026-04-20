import { Controller, Post, Body, Req, Res, UseGuards, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import * as crypto from "crypto";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  accessCookieOptions,
  refreshCookieOptions,
  clearCookieOptions,
  csrfCookieOptions,
} from "../../common/config/cookie.config";
import { CSRF_COOKIE_NAME } from "../../common/guards/csrf.guard";
import { SkipCsrf } from "../../common/decorators/skip-csrf.decorator";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("login")
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto.email, dto.password);

    // Set auth tokens as httpOnly cookies
    res.cookie(ACCESS_COOKIE_NAME, result.accessToken, accessCookieOptions);
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions);

    // Set CSRF token as a non-httpOnly cookie (frontend must echo it as a header)
    const csrfToken = crypto.randomUUID();
    res.cookie(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions);

    return {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      csrfToken,
    };
  }

  @Post("refresh")
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Read refresh token from cookie (preferred) or body (backward compat)
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;

    if (!refreshToken) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        message: "Token de refresco requerido",
      });
      return;
    }

    const result = await this.authService.refresh(refreshToken);

    // Set new rotated tokens as cookies
    res.cookie(ACCESS_COOKIE_NAME, result.accessToken, accessCookieOptions);
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions);

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  @Post("forgot-password")
  @SkipCsrf()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post("reset-password")
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: JwtPayload, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.sub);

    // Clear auth cookies
    res.cookie(ACCESS_COOKIE_NAME, "", clearCookieOptions("/"));
    res.cookie(REFRESH_COOKIE_NAME, "", clearCookieOptions("/"));

    return { message: "Sesion cerrada" };
  }
}
