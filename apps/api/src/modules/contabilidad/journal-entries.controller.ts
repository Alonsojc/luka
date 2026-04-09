import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Permissions } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { JournalEntriesService } from "./journal-entries.service";

@ApiTags("Contabilidad - Polizas")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("contabilidad/journal-entries")
export class JournalEntriesController {
  constructor(private journalEntriesService: JournalEntriesService) {}

  @Get()
  @Permissions("contabilidad:view")
  findAll(@CurrentUser() user: JwtPayload) {
    return this.journalEntriesService.findAll(user.organizationId);
  }

  @Get(":id")
  @Permissions("contabilidad:view")
  findOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.journalEntriesService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions("contabilidad:create")
  create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      branchId?: string;
      entryDate: string;
      type: string;
      description: string;
      referenceType?: string;
      referenceId?: string;
      lines: Array<{
        accountId: string;
        debit: number;
        credit: number;
        description?: string;
      }>;
    },
  ) {
    return this.journalEntriesService.create(
      user.organizationId,
      user.sub,
      body,
    );
  }

  @Patch(":id")
  @Permissions("contabilidad:edit")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body()
    body: {
      description?: string;
      lines?: Array<{
        accountId: string;
        debit: number;
        credit: number;
        description?: string;
      }>;
    },
  ) {
    return this.journalEntriesService.update(user.organizationId, id, body);
  }

  @Patch(":id/post")
  @Permissions("contabilidad:edit")
  post(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.journalEntriesService.post(
      user.organizationId,
      id,
      user.sub,
    );
  }

  @Patch(":id/reverse")
  @Permissions("contabilidad:edit")
  reverse(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.journalEntriesService.reverse(user.organizationId, id);
  }
}
