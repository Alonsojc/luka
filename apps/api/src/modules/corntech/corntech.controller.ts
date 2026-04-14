import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { BranchAccessGuard } from "../../common/guards/branch-access.guard";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { CorntechService } from "./corntech.service";

@ApiTags("Corntech POS")
@Controller("corntech")
export class CorntechController {
  constructor(private corntechService: CorntechService) {}

  // ======================================================
  // POS SYNC ENGINE
  // ======================================================

  /** Receive a batch of sales from a POS terminal */
  @Post("sync/sales")
  @UseGuards(ApiKeyGuard)
  @Permissions("corntech:sync")
  processSalesBatch(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      branchId: string;
      sales: Array<{
        ticketNumber: string;
        date: string;
        subtotal: number;
        tax: number;
        total: number;
        paymentMethod: string;
        terminalId?: string;
        items: Array<{
          sku: string;
          name: string;
          quantity: number;
          unitPrice: number;
          total: number;
        }>;
      }>;
    },
  ) {
    return this.corntechService.processSalesBatch(
      user.organizationId,
      body.branchId,
      body.sales,
    );
  }

  /** Get sync status per branch */
  @Get("sync/status")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Permissions("corntech:view")
  getSyncStatus(@CurrentUser() user: JwtPayload) {
    return this.corntechService.getSyncStatus(user.organizationId);
  }

  /** Get sync log history */
  @Get("sync/logs")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, BranchAccessGuard)
  @Permissions("corntech:view")
  getPosSyncLogs(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.corntechService.getPosSyncLogs(
      user.organizationId,
      branchId,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /** Daily sales summary grouped by branch and payment method */
  @Get("sales/summary")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Permissions("corntech:view")
  getDailySummary(
    @CurrentUser() user: JwtPayload,
    @Query("date") date?: string,
  ) {
    const targetDate = date || new Date().toISOString().split("T")[0];
    return this.corntechService.getDailySummary(
      user.organizationId,
      targetDate,
    );
  }

  /** List recent POS sales */
  @Get("sales/list")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, BranchAccessGuard)
  @Permissions("corntech:view")
  getPosSales(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId?: string,
    @Query("date") date?: string,
    @Query("limit") limit?: string,
  ) {
    return this.corntechService.getPosSales(
      user.organizationId,
      branchId,
      date,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  // ======================================================
  // LEGACY CORNTECH ENDPOINTS
  // ======================================================

  @Get("sync-logs/:branchId")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, BranchAccessGuard)
  @Permissions("corntech:view")
  getSyncLogs(
    @Param("branchId") branchId: string,
    @Query("syncType") syncType?: string,
  ) {
    return this.corntechService.getSyncLogs(branchId, syncType);
  }

  @Post("sync-logs")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Permissions("corntech:sync")
  createSyncLog(
    @Body() body: { branchId: string; syncType: string },
  ) {
    return this.corntechService.createSyncLog(body);
  }

  @Patch("sync-logs/:id/complete")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Permissions("corntech:sync")
  completeSyncLog(
    @Param("id") id: string,
    @Body()
    body: {
      status: string;
      recordsSynced?: number;
      errorMessage?: string;
    },
  ) {
    return this.corntechService.completeSyncLog(id, body);
  }

  @Get("sales/:branchId")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, BranchAccessGuard)
  @Permissions("corntech:view")
  getSales(
    @Param("branchId") branchId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.corntechService.getSales(branchId, startDate, endDate);
  }

  @Post("sales")
  @UseGuards(ApiKeyGuard)
  @Permissions("corntech:sync")
  upsertSale(
    @Body()
    body: {
      branchId: string;
      corntechSaleId: string;
      saleDate: string;
      ticketNumber?: string;
      subtotal: number;
      tax: number;
      total: number;
      paymentMethod?: string;
      items?: any[];
    },
  ) {
    return this.corntechService.upsertSale(body);
  }

  @Post("sales/bulk/:branchId")
  @UseGuards(ApiKeyGuard)
  @Permissions("corntech:sync")
  bulkUpsertSales(
    @Param("branchId") branchId: string,
    @Body()
    body: {
      sales: Array<{
        corntechSaleId: string;
        saleDate: string;
        ticketNumber?: string;
        subtotal: number;
        tax: number;
        total: number;
        paymentMethod?: string;
        items?: any[];
      }>;
    },
  ) {
    return this.corntechService.bulkUpsertSales(branchId, body.sales);
  }

  @Get("cash-closings/:branchId")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, BranchAccessGuard)
  @Permissions("corntech:view")
  getCashClosings(
    @Param("branchId") branchId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.corntechService.getCashClosings(
      branchId,
      startDate,
      endDate,
    );
  }

  @Post("cash-closings")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Permissions("corntech:sync")
  upsertCashClosing(
    @Body()
    body: {
      branchId: string;
      corntechClosingId: string;
      closingDate: string;
      totalCash: number;
      totalCard: number;
      totalOther?: number;
      expectedTotal: number;
      actualTotal: number;
      difference?: number;
      cashierName?: string;
    },
  ) {
    return this.corntechService.upsertCashClosing(body);
  }
}
