import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { RequisitionsService } from "./requisitions.service";
import { CreateRequisitionDto, UpdateRequisitionDto } from "./dto/create-requisition.dto";
import { ApproveRequisitionDto, RejectRequisitionDto } from "./dto/approve-requisition.dto";

@ApiTags("Requisiciones")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("requisitions")
export class RequisitionsController {
  constructor(private requisitionsService: RequisitionsService) {}

  @Get("summary")
  @Permissions("inventarios:view")
  getSummary(@CurrentUser() user: JwtPayload, @Query("branchId") branchId?: string) {
    return this.requisitionsService.getSummary(user.organizationId, branchId);
  }

  @Get()
  @Permissions("inventarios:view")
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query("status") status?: string,
    @Query("requestingBranchId") requestingBranchId?: string,
    @Query("fulfillingBranchId") fulfillingBranchId?: string,
    @Query("priority") priority?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.requisitionsService.findAll(
      user.organizationId,
      { status, requestingBranchId, fulfillingBranchId, priority, dateFrom, dateTo },
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get(":id")
  @Permissions("inventarios:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.requisitionsService.findOne(id, user.organizationId);
  }

  @Post()
  @Permissions("inventarios:create")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRequisitionDto) {
    return this.requisitionsService.create(user.sub, user.organizationId, dto);
  }

  @Patch(":id")
  @Permissions("inventarios:update")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateRequisitionDto,
  ) {
    return this.requisitionsService.update(id, user.sub, user.organizationId, dto);
  }

  @Post(":id/submit")
  @Permissions("inventarios:create")
  submit(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.requisitionsService.submit(id, user.sub, user.organizationId);
  }

  @Post(":id/approve")
  @Permissions("inventarios:update")
  approve(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: ApproveRequisitionDto,
  ) {
    return this.requisitionsService.approve(id, user.sub, user.organizationId, dto);
  }

  @Post(":id/reject")
  @Permissions("inventarios:update")
  reject(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: RejectRequisitionDto,
  ) {
    return this.requisitionsService.reject(id, user.sub, user.organizationId, dto);
  }

  @Post(":id/fulfill")
  @Permissions("inventarios:update")
  fulfill(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.requisitionsService.fulfill(id, user.sub, user.organizationId);
  }

  @Post(":id/cancel")
  @Permissions("inventarios:update")
  cancel(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.requisitionsService.cancel(id, user.sub, user.organizationId);
  }
}
