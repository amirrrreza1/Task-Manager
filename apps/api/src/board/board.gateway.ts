import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/auth.types';
import type { BoardEvent } from './board.types';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class BoardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(BoardGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`WebSocket connection rejected: No token provided (${client.id})`);
        client.disconnect(true);
        return;
      }

      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          username: true,
          displayName: true,
          isActive: true,
          role: true,
        },
      });

      if (!user || !user.isActive) {
        this.logger.warn(`WebSocket connection rejected: User inactive or not found (${client.id})`);
        client.disconnect(true);
        return;
      }

      client.data.user = user;
      this.logger.debug(`WebSocket connected: ${user.username} (${client.id})`);
    } catch (error) {
      this.logger.warn(
        `WebSocket connection failed: ${error instanceof Error ? error.message : String(error)} (${client.id})`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data?.user;
    this.logger.debug(`WebSocket disconnected: ${user?.username ?? client.id}`);
  }

  @SubscribeMessage('join:workspace')
  handleJoinWorkspace(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { workspaceId: string },
  ) {
    if (!data?.workspaceId) return { success: false, error: 'workspaceId is required' };
    const room = `workspace:${data.workspaceId}`;
    void client.join(room);
    this.logger.debug(`Socket ${client.id} joined room ${room}`);
    return { success: true, room };
  }

  @SubscribeMessage('leave:workspace')
  handleLeaveWorkspace(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { workspaceId: string },
  ) {
    if (!data?.workspaceId) return { success: false, error: 'workspaceId is required' };
    const room = `workspace:${data.workspaceId}`;
    void client.leave(room);
    this.logger.debug(`Socket ${client.id} left room ${room}`);
    return { success: true, room };
  }

  emitBoardUpdate(workspaceId: string, event: BoardEvent) {
    if (!this.server) return;
    const room = `workspace:${workspaceId}`;
    this.server.to(room).emit('board:updated', event);
    this.logger.debug(`Emitted ${event.eventType} to room ${room}`);
  }

  private extractToken(client: Socket): string | null {
    const authHeader = client.handshake.headers?.authorization;
    if (authHeader) {
      const [scheme, token] = authHeader.split(' ');
      if (scheme === 'Bearer' && token) return token;
    }
    if (typeof client.handshake.auth?.token === 'string') {
      return client.handshake.auth.token;
    }
    if (typeof client.handshake.query?.token === 'string') {
      return client.handshake.query.token;
    }
    return null;
  }
}
