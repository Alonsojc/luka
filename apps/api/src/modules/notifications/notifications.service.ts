import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { toNullablePrismaJson } from "../../common/utils/prisma-json";
import { NotificationsGateway } from "./notifications.gateway";

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    @Optional() private gateway?: NotificationsGateway,
  ) {}

  /**
   * Create a single notification for a specific user.
   */
  async create(data: {
    organizationId: string;
    userId: string;
    type: string;
    severity?: string;
    title: string;
    message: string;
    link?: string;
    metadata?: Record<string, unknown>;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        type: data.type,
        severity: data.severity || "info",
        title: data.title,
        message: data.message,
        link: data.link || null,
        metadata: toNullablePrismaJson(data.metadata),
      },
    });

    // Push real-time notification via WebSocket if gateway is available
    if (this.gateway) {
      this.gateway.sendToUser(data.userId, notification as unknown as Record<string, unknown>);
    }

    return notification;
  }

  /**
   * Create notifications for all users with a specific role in an organization.
   */
  async createForRole(
    organizationId: string,
    roleName: string,
    notification: {
      type: string;
      severity?: string;
      title: string;
      message: string;
      link?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const userBranchRoles = await this.prisma.userBranchRole.findMany({
      where: {
        role: { organizationId, name: roleName },
      },
      select: { userId: true },
    });

    const uniqueUserIds = [...new Set(userBranchRoles.map((ubr) => ubr.userId))];

    if (uniqueUserIds.length === 0) return [];

    const data = uniqueUserIds.map((userId) => ({
      organizationId,
      userId,
      type: notification.type,
      severity: notification.severity || "info",
      title: notification.title,
      message: notification.message,
      link: notification.link || null,
      metadata: toNullablePrismaJson(notification.metadata),
    }));

    await this.prisma.notification.createMany({ data });
    return { count: data.length };
  }

  /**
   * Create notifications for all users assigned to a specific branch.
   */
  async createForBranch(
    organizationId: string,
    branchId: string,
    notification: {
      type: string;
      severity?: string;
      title: string;
      message: string;
      link?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const userBranchRoles = await this.prisma.userBranchRole.findMany({
      where: {
        branchId,
        role: { organizationId },
      },
      select: { userId: true },
    });

    const uniqueUserIds = [...new Set(userBranchRoles.map((ubr) => ubr.userId))];

    if (uniqueUserIds.length === 0) return [];

    const data = uniqueUserIds.map((userId) => ({
      organizationId,
      userId,
      type: notification.type,
      severity: notification.severity || "info",
      title: notification.title,
      message: notification.message,
      link: notification.link || null,
      metadata: toNullablePrismaJson(notification.metadata),
    }));

    await this.prisma.notification.createMany({ data });
    return { count: data.length };
  }

  /**
   * Get paginated notifications for a user, ordered by createdAt DESC.
   */
  async findAll(
    userId: string,
    filters: {
      isRead?: boolean;
      type?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId };
    if (filters.isRead !== undefined) {
      where.isRead = filters.isRead;
    }
    if (filters.type) {
      where.type = filters.type;
    }

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      notifications,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get unread count for a user.
   */
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Delete old notifications for an organization.
   */
  async deleteOld(organizationId: string, olderThanDays: number) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    return this.prisma.notification.deleteMany({
      where: {
        organizationId,
        createdAt: { lt: cutoff },
      },
    });
  }
}
