import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { PrismaModule } from "./common/prisma/prisma.module";
import { CacheModule } from "./common/cache/cache.module";
import { EmailModule } from "./modules/email/email.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BranchesModule } from "./modules/branches/branches.module";
import { InventariosModule } from "./modules/inventarios/inventarios.module";
import { ComprasModule } from "./modules/compras/compras.module";
import { BancosModule } from "./modules/bancos/bancos.module";
import { NominaModule } from "./modules/nomina/nomina.module";
import { FacturacionModule } from "./modules/facturacion/facturacion.module";
import { ContabilidadModule } from "./modules/contabilidad/contabilidad.module";
import { CrmModule } from "./modules/crm/crm.module";
import { ReportesModule } from "./modules/reportes/reportes.module";
import { InversionistasModule } from "./modules/inversionistas/inversionistas.module";
import { CorntechModule } from "./modules/corntech/corntech.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { UsersModule } from "./modules/users/users.module";
import { HealthModule } from "./modules/health/health.module";
import { AuditModule } from "./modules/audit/audit.module";
import { MermaModule } from "./modules/merma/merma.module";
import { LoyaltyModule } from "./modules/loyalty/loyalty.module";
import { DeliveryModule } from "./modules/delivery/delivery.module";
import { RequisitionsModule } from "./modules/requisitions/requisitions.module";
import { LegalEntitiesModule } from "./modules/legal-entities/legal-entities.module";
import { WhatsAppModule } from "./modules/whatsapp/whatsapp.module";
import { ConfiguracionModule } from "./modules/configuracion/configuracion.module";
import { QueuesModule } from "./common/queues/queues.module";
import { AuditInterceptor } from "./common/interceptors/audit-log.interceptor";
import { TenantInterceptor } from "./common/interceptors/tenant.interceptor";
import { CsrfGuard } from "./common/guards/csrf.guard";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute window
        limit: 100, // 100 requests per minute globally
      },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    CacheModule,
    EmailModule,
    AuthModule,
    BranchesModule,
    InventariosModule,
    ComprasModule,
    BancosModule,
    NominaModule,
    FacturacionModule,
    ContabilidadModule,
    CrmModule,
    ReportesModule,
    InversionistasModule,
    CorntechModule,
    NotificationsModule,
    UsersModule,
    HealthModule,
    AuditModule,
    MermaModule,
    LoyaltyModule,
    DeliveryModule,
    RequisitionsModule,
    LegalEntitiesModule,
    WhatsAppModule,
    ConfiguracionModule,
    QueuesModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
