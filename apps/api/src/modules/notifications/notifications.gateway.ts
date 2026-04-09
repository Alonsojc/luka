// NOTE: This gateway requires the following packages to be installed:
//   pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io
// Run from the apps/api directory before using this gateway.

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";

@WebSocketGateway({
  cors: {
    origin: [
      "http://localhost:3002",
      process.env.FRONTEND_URL || "http://localhost:3002",
    ],
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

  /** Map of userId -> set of socket IDs for that user. */
  private userSockets = new Map<string, Set<string>>();

  /** Reverse map of socketId -> userId for fast disconnect cleanup. */
  private socketToUser = new Map<string, string>();

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (!userId) {
      this.logger.warn(`Socket ${client.id} connected without userId — ignoring`);
      return;
    }

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);
    this.socketToUser.set(client.id, userId);

    this.logger.log(`User ${userId} connected (socket ${client.id})`);
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
   * Broadcast a notification to ALL connected clients.
   * Useful for org-wide announcements.
   */
  sendToOrg(_orgId: string, notification: Record<string, unknown>) {
    this.server.emit("notification", notification);
  }

  /** Get the number of currently connected unique users. */
  getConnectedUserCount(): number {
    return this.userSockets.size;
  }
}
