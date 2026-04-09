import { Module } from "@nestjs/common";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { LoyaltyController } from "./loyalty.controller";
import { LoyaltyService } from "./loyalty.service";
import { PromotionsController } from "./promotions.controller";
import { PromotionsService } from "./promotions.service";

@Module({
  controllers: [CustomersController, LoyaltyController, PromotionsController],
  providers: [CustomersService, LoyaltyService, PromotionsService],
  exports: [CustomersService, LoyaltyService, PromotionsService],
})
export class CrmModule {}
