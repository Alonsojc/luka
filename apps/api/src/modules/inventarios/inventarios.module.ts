import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { RecipesController } from "./recipes.controller";
import { RecipesService } from "./recipes.service";
import { TransfersController } from "./transfers.controller";
import { TransfersService } from "./transfers.service";
import { PresentationsController } from "./presentations.controller";
import { PresentationsService } from "./presentations.service";
import { InventoryLoadController } from "./inventory-load.controller";
import { InventoryLoadService } from "./inventory-load.service";
import { KardexController } from "./kardex.controller";
import { KardexService } from "./kardex.service";
import { PhysicalCountController } from "./physical-count.controller";
import { PhysicalCountService } from "./physical-count.service";
import { LotsController } from "./lots.controller";
import { LotsService } from "./lots.service";
import { ForecastController } from "./forecast.controller";
import { ForecastService } from "./forecast.service";

@Module({
  controllers: [
    ProductsController,
    InventoryController,
    RecipesController,
    TransfersController,
    PresentationsController,
    InventoryLoadController,
    KardexController,
    PhysicalCountController,
    LotsController,
    ForecastController,
  ],
  providers: [
    ProductsService,
    InventoryService,
    RecipesService,
    TransfersService,
    PresentationsService,
    InventoryLoadService,
    KardexService,
    PhysicalCountService,
    LotsService,
    ForecastService,
  ],
  exports: [ProductsService, InventoryService, RecipesService, TransfersService, PresentationsService, InventoryLoadService, KardexService, PhysicalCountService, LotsService, ForecastService],
})
export class InventariosModule {}
