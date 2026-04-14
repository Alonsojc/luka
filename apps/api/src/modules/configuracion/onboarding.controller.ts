import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { SkipCsrf } from "../../common/decorators/skip-csrf.decorator";
import { OnboardingService } from "./onboarding.service";
import { OnboardDto } from "./dto/onboard.dto";

@ApiTags("Configuracion - Onboarding")
@Controller("onboarding")
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  /**
   * Create a new organization with all required initial configuration.
   * This is an unauthenticated endpoint (the org doesn't exist yet).
   * Heavily rate-limited to prevent abuse.
   */
  @Post()
  @SkipCsrf()
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 per hour
  @HttpCode(HttpStatus.CREATED)
  async onboard(@Body() dto: OnboardDto) {
    return this.onboardingService.onboard(dto);
  }
}
