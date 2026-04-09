import { Module } from "@nestjs/common";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersService } from "./suppliers.service";
import { PurchaseOrdersController } from "./purchase-orders.controller";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { AutoPurchaseController } from "./auto-purchase.controller";
import { AutoPurchaseService } from "./auto-purchase.service";

@Module({
  controllers: [
    SuppliersController,
    PurchaseOrdersController,
    AutoPurchaseController,
  ],
  providers: [SuppliersService, PurchaseOrdersService, AutoPurchaseService],
  exports: [SuppliersService, PurchaseOrdersService, AutoPurchaseService],
})
export class ComprasModule {}
