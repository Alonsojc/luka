import {
  Controller,
  Get,
  Post,
  Param,
  Query,
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
import { NotificationsService } from "./notifications.service";

@ApiTags("Notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query("isRead") isRead?: string,
    @Query("type") type?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.notificationsService.findAll(user.sub, {
      isRead: isRead !== undefined ? isRead === "true" : undefined,
      type: type || undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get("unread-count")
  getUnreadCount(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.getUnreadCount(user.sub);
  }

  @Post(":id/read")
  markAsRead(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.notificationsService.markAsRead(user.sub, id);
  }

  @Post("read-all")
  markAllAsRead(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.markAllAsRead(user.sub);
  }

  @Post("send")
  @Permissions("configuracion:edit")
  async send(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      userId?: string;
      roleName?: string;
      branchId?: string;
      type: string;
      severity?: string;
      title: string;
      message: string;
      link?: string;
    },
  ) {
    const orgId = user.organizationId;

    if (body.userId) {
      return this.notificationsService.create({
        organizationId: orgId,
        userId: body.userId,
        type: body.type,
        severity: body.severity,
        title: body.title,
        message: body.message,
        link: body.link,
      });
    }

    if (body.roleName) {
      return this.notificationsService.createForRole(orgId, body.roleName, {
        type: body.type,
        severity: body.severity,
        title: body.title,
        message: body.message,
        link: body.link,
      });
    }

    if (body.branchId) {
      return this.notificationsService.createForBranch(orgId, body.branchId, {
        type: body.type,
        severity: body.severity,
        title: body.title,
        message: body.message,
        link: body.link,
      });
    }

    return { error: "Debe especificar userId, roleName o branchId" };
  }
}
