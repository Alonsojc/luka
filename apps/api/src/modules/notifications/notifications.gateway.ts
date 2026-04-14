import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { JwtPayload } from "../../common/decorators/current-user.decorator";

@WebSocketGateway({
  cors: {
    origin: [process.env.WEB_URL || "http://localhost:3002"],
    credentials: true,
  },
  namespace: "/notifications",
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private jwtService: JwtService) {}

  /** Map of userId -> set of socket IDs for that user. */
  private userSockets = new Map<string, Set<string>>();

  /** Reverse map of socketId -> userId for fast disconnect cleanup. */
  private socketToUser = new Map<string, string>();

  /** Reverse map of socketId -> organizationId for org-scoped broadcasts. */
  private socketToOrg = new Map<string, string>();

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.query?.token as string);

    if (!token) {
      this.logger.warn(`Socket ${client.id} connected without token — disconnecting`);
      client.disconnect(true);
      return;
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      this.logger.warn(`Socket ${client.id} provided invalid token — disconnecting`);
      client.disconnect(true);
      return;
    }

    const userId = payload.sub;
    const orgId = payload.organizationId;

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);
    this.socketToUser.set(client.id, userId);
    this.socketToOrg.set(client.id, orgId);

    // Join org room for org-wide broadcasts
    client.join(`org:${orgId}`);

    this.logger.log(`User ${userId} connected (socket ${client.id}, org ${orgId})`);
  }

  handleDisconnect(client: Socket) {
    const userId = this.socketToUser.get(client.id);
    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
      this.socketToUser.delete(client.id);
      this.socketToOrg.delete(client.id);
      this.logger.log(`User ${userId} disconnected (socket ${client.id})`);
    }
  }

  /**
   * Send a notification to a specific user (all their open sockets).
   * Called by NotificationsService after persisting a notification.
   */
  sendToUser(userId: string, notification: Record<string, unknown>) {
    const sockets = this.userSockets.get(userId);
    if (sockets && sockets.size > 0) {
      for (const socketId of sockets) {
        this.server.to(socketId).emit("notification", notification);
      }
      this.logger.debug(
        `Sent notification to user ${userId} (${sockets.size} socket(s))`,
      );
    }
  }

  /**
   * Broadcast a notification to all connected clients in a specific organization.
   */
  sendToOrg(orgId: string, notification: Record<string, unknown>) {
    this.server.to(`org:${orgId}`).emit("notification", notification);
  }

  /** Get the number of currently connected unique users. */
  getConnectedUserCount(): number {
    return this.userSockets.size;
  }
}
