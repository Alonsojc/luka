import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../../common/prisma/prisma.service";
import { QUEUE_AUDIT_LOG } from "../../common/queues/queues.constants";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(QUEUE_AUDIT_LOG) private auditQueue: Queue,
  ) {}

  /**
   * Enqueue an audit log entry via BullMQ.
   * Never throws — audit logging must never break business logic.
   * Falls back to direct Prisma write if the queue is unavailable.
   */
  log(params: {
    organizationId: string;
    userId?: string;
    userName?: string;
    action: string;
    module: string;
    entityType?: string;
    entityId?: string;
    description: string;
    changes?: Record<string, { old: any; new: any }>;
    ipAddress?: string;
    userAgent?: string;
  }): void {
    this.auditQueue
      .add("audit-log", params, {
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400 },
      })
      .catch(() => {
        // Queue unavailable — fall back to direct write
        this.prisma.auditLog.create({ data: params }).catch((err) => {
          this.logger.error(`Audit log failed: ${err.message}`);
        });
      });
  }

  async findAll(
    organizationId: string,
    filters?: {
      module?: string;
      action?: string;
      userId?: string;
      entityType?: string;
      entityId?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const where: any = { organizationId };

    if (filters?.module) where.module = filters.module;
    if (filters?.action) where.action = filters.action;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.entityId) where.entityId = filters.entityId;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { logs, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findOne(organizationId: string, id: string) {
    return this.prisma.auditLog.findFirst({
      where: { id, organizationId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }

  async getStats(organizationId: string, startDate?: Date, endDate?: Date) {
    const where: any = { organizationId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [totalActions, byModule, byAction, byUser, dailyActivity] = await Promise.all([
      this.prisma.auditLog.count({ where }),

      this.prisma.auditLog.groupBy({
        by: ["module"],
        where,
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),

      this.prisma.auditLog.groupBy({
        by: ["action"],
        where,
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),

      this.prisma.auditLog.groupBy({
        by: ["userId", "userName"],
        where: { ...where, userId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),

      this.prisma.$queryRawUnsafe<Array<{ date: string; count: bigint }>>(
        `SELECT DATE(created_at) as date, COUNT(*)::int as count
         FROM audit_logs
         WHERE organization_id = $1
         ${startDate ? `AND created_at >= $2` : `AND created_at >= NOW() - INTERVAL '30 days'`}
         ${endDate ? `AND created_at <= $${startDate ? 3 : 2}` : ""}
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        ...[organizationId, ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : [])],
      ),
    ]);

    // Find peak hour
    const peakHourResult = await this.prisma.$queryRawUnsafe<
      Array<{ hour: number; count: bigint }>
    >(
      `SELECT EXTRACT(HOUR FROM created_at)::int as hour, COUNT(*)::int as count
       FROM audit_logs
       WHERE organization_id = $1
       ${startDate ? `AND created_at >= $2` : ""}
       ${endDate ? `AND created_at <= $${startDate ? 3 : 2}` : ""}
       GROUP BY hour
       ORDER BY count DESC
       LIMIT 1`,
      ...[organizationId, ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : [])],
    );

    const activeUsers = new Set(byUser.filter((u) => u.userId).map((u) => u.userId)).size;

    const topModule = byModule.length > 0 ? byModule[0].module : "N/A";
    const peakHour = peakHourResult.length > 0 ? `${peakHourResult[0].hour}:00` : "N/A";

    return {
      totalActions,
      activeUsers,
      topModule,
      peakHour,
      byModule: byModule.map((m) => ({ module: m.module, count: m._count.id })),
      byAction: byAction.map((a) => ({ action: a.action, count: a._count.id })),
      byUser: byUser.map((u) => ({
        userId: u.userId,
        userName: u.userName,
        count: u._count.id,
      })),
      dailyActivity: dailyActivity.map((d) => ({
        date: String(d.date),
        count: Number(d.count),
      })),
    };
  }

  async getEntityHistory(organizationId: string, entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { organizationId, entityType, entityId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async cleanOld(organizationId: string, olderThan: Date) {
    const result = await this.prisma.auditLog.deleteMany({
      where: {
        organizationId,
        createdAt: { lt: olderThan },
      },
    });
    return { deleted: result.count };
  }
}
