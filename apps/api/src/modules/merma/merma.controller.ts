import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { BranchAccessGuard } from "../../common/guards/branch-access.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { MermaService } from "./merma.service";
import { CreateMermaDto } from "./dto/create-merma.dto";
import { UpdateMermaDto } from "./dto/update-merma.dto";

@ApiTags("Merma")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, BranchAccessGuard)
@Controller("merma")
export class MermaController {
  constructor(private mermaService: MermaService) {}

  @Get()
  @Permissions("inventarios:view")
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId?: string,
    @Query("productId") productId?: string,
    @Query("reason") reason?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.mermaService.findAll(user.organizationId, {
      branchId,
      productId,
      reason,
      dateFrom,
      dateTo,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get("summary")
  @Permissions("inventarios:view")
  getSummary(
    @CurrentUser() user: JwtPayload,
    @Query("branchId") branchId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.mermaService.getSummary(user.organizationId, {
      branchId,
      dateFrom,
      dateTo,
    });
  }

  @Get(":id")
  @Permissions("inventarios:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.mermaService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions("inventarios:edit")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateMermaDto) {
    return this.mermaService.create(user.organizationId, user.sub, dto);
  }

  @Patch(":id")
  @Permissions("inventarios:edit")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateMermaDto,
  ) {
    return this.mermaService.update(user.organizationId, id, dto);
  }

  @Delete(":id")
  @Permissions("inventarios:edit")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.mermaService.remove(user.organizationId, id);
  }
}
