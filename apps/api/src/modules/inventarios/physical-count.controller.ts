import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { BranchAccessGuard } from "../../common/guards/branch-access.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { PhysicalCountService } from "./physical-count.service";
import {
  CreatePhysicalCountDto,
  UpdatePhysicalCountItemDto,
  BulkUpdatePhysicalCountItemsDto,
} from "./dto/update-physical-count-item.dto";

@ApiTags("Inventarios - Conteo Fisico")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, BranchAccessGuard)
@Controller("inventarios/physical-counts")
export class PhysicalCountController {
  constructor(private physicalCountService: PhysicalCountService) {}

  @Get()
  @Permissions("inventarios:view")
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId?: string,
    @Query("status") status?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.physicalCountService.getAll(
      user.organizationId,
      { branchId, status, dateFrom, dateTo },
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get("history/:branchId")
  @Permissions("inventarios:view")
  getHistory(@CurrentUser() user: JwtPayload, @Param("branchId") branchId: string) {
    return this.physicalCountService.getHistory(user.organizationId, branchId);
  }

  @Get(":id")
  @Permissions("inventarios:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.physicalCountService.getOne(user.organizationId, id);
  }

  @Post()
  @Permissions("inventarios:create")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePhysicalCountDto) {
    return this.physicalCountService.create(user.organizationId, dto.branchId, user.sub, dto.notes);
  }

  @Patch(":id/items/:itemId")
  @Permissions("inventarios:edit")
  updateItem(
    @CurrentUser() user: JwtPayload,
    @Param("id") countId: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdatePhysicalCountItemDto,
  ) {
    return this.physicalCountService.updateItem(user.organizationId, countId, itemId, dto);
  }

  @Patch(":id/items")
  @Permissions("inventarios:edit")
  bulkUpdateItems(
    @CurrentUser() user: JwtPayload,
    @Param("id") countId: string,
    @Body() dto: BulkUpdatePhysicalCountItemsDto,
  ) {
    return this.physicalCountService.bulkUpdateItems(user.organizationId, countId, dto.items);
  }

  @Post(":id/complete")
  @Permissions("inventarios:edit")
  complete(@CurrentUser() user: JwtPayload, @Param("id") countId: string) {
    return this.physicalCountService.complete(user.organizationId, countId, user.sub);
  }

  @Post(":id/cancel")
  @Permissions("inventarios:edit")
  cancel(@CurrentUser() user: JwtPayload, @Param("id") countId: string) {
    return this.physicalCountService.cancel(user.organizationId, countId);
  }
}
