import { Module } from "@nestjs/common";
import { DataImportController } from "./data-import.controller";
import { DataImportService } from "./data-import.service";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";

@Module({
  controllers: [DataImportController, OnboardingController],
  providers: [DataImportService, OnboardingService],
  exports: [DataImportService, OnboardingService],
})
export class ConfiguracionModule {}
