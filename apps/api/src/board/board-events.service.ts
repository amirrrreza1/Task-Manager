import { Injectable } from '@nestjs/common';
import { BoardGateway } from './board.gateway';
import type { BoardEvent, BoardEventType } from './board.types';

@Injectable()
export class BoardEventsService {
  constructor(private readonly gateway: BoardGateway) {}

  emitBoardUpdate(
    workspaceId: string,
    eventType: BoardEventType,
    entityId?: string,
    actorId?: string,
    payload?: Record<string, unknown>,
  ) {
    if (!workspaceId) return;
    const event: BoardEvent = {
      workspaceId,
      eventType,
      entityId,
      actorId,
      timestamp: new Date().toISOString(),
      payload,
    };
    this.gateway.emitBoardUpdate(workspaceId, event);
  }
}
