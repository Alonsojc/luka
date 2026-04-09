import { Module } from "@nestjs/common";
import { AccountCatalogController } from "./account-catalog.controller";
import { AccountCatalogService } from "./account-catalog.service";
import { JournalEntriesController } from "./journal-entries.controller";
import { JournalEntriesService } from "./journal-entries.service";
import { AutoPolizasController } from "./auto-polizas.controller";
import { AutoPolizasService } from "./auto-polizas.service";
import { DiotController } from "./diot.controller";
import { DiotService } from "./diot.service";
import { DeclarationsController } from "./declarations.controller";
import { DeclarationsService } from "./declarations.service";

@Module({
  controllers: [
    AccountCatalogController,
    JournalEntriesController,
    AutoPolizasController,
    DiotController,
    DeclarationsController,
  ],
  providers: [
    AccountCatalogService,
    JournalEntriesService,
    AutoPolizasService,
    DiotService,
    DeclarationsService,
  ],
  exports: [
    AccountCatalogService,
    JournalEntriesService,
    AutoPolizasService,
    DiotService,
    DeclarationsService,
  ],
})
export class ContabilidadModule {}
