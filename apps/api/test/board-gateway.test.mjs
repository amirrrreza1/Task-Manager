import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import gatewayModule from '../dist/board/board.gateway.js';
import eventsModule from '../dist/board/board-events.service.js';

const { BoardGateway } = gatewayModule;
const { BoardEventsService } = eventsModule;

describe('BoardGateway and BoardEventsService', () => {
  it('rejects connection when no token is provided', async () => {
    let disconnected = false;
    const client = {
      id: 'socket-1',
      handshake: { headers: {}, auth: {}, query: {} },
      disconnect: (val) => {
        disconnected = Boolean(val);
      },
      data: {},
    };
    const jwt = { verifyAsync: async () => ({ sub: 'user-1' }) };
    const prisma = { user: { findUnique: async () => ({ id: 'user-1', isActive: true }) } };

    const gateway = new BoardGateway(jwt, prisma);
    await gateway.handleConnection(client);

    assert.equal(disconnected, true);
    assert.equal(client.data.user, undefined);
  });

  it('rejects connection when token verification fails', async () => {
    let disconnected = false;
    const client = {
      id: 'socket-2',
      handshake: { auth: { token: 'bad-token' }, headers: {}, query: {} },
      disconnect: (val) => {
        disconnected = Boolean(val);
      },
      data: {},
    };
    const jwt = {
      verifyAsync: async () => {
        throw new Error('invalid token');
      },
    };
    const prisma = { user: { findUnique: async () => null } };

    const gateway = new BoardGateway(jwt, prisma);
    await gateway.handleConnection(client);

    assert.equal(disconnected, true);
    assert.equal(client.data.user, undefined);
  });

  it('rejects connection when user is inactive', async () => {
    let disconnected = false;
    const client = {
      id: 'socket-3',
      handshake: { auth: { token: 'valid-token' }, headers: {}, query: {} },
      disconnect: (val) => {
        disconnected = Boolean(val);
      },
      data: {},
    };
    const jwt = { verifyAsync: async () => ({ sub: 'user-inactive' }) };
    const prisma = {
      user: {
        findUnique: async () => ({
          id: 'user-inactive',
          username: 'disabled_user',
          isActive: false,
        }),
      },
    };

    const gateway = new BoardGateway(jwt, prisma);
    await gateway.handleConnection(client);

    assert.equal(disconnected, true);
    assert.equal(client.data.user, undefined);
  });

  it('accepts connection and assigns user when token and user are valid', async () => {
    let disconnected = false;
    const client = {
      id: 'socket-4',
      handshake: { auth: { token: 'valid-token' }, headers: {}, query: {} },
      disconnect: () => {
        disconnected = true;
      },
      data: {},
    };
    const mockUser = {
      id: 'user-active',
      username: 'alex',
      displayName: 'Alex Doe',
      isActive: true,
      role: 'MEMBER',
    };
    const jwt = { verifyAsync: async () => ({ sub: 'user-active' }) };
    const prisma = { user: { findUnique: async () => mockUser } };

    const gateway = new BoardGateway(jwt, prisma);
    await gateway.handleConnection(client);

    assert.equal(disconnected, false);
    assert.deepEqual(client.data.user, mockUser);
  });

  it('joins and leaves workspace rooms', () => {
    const joinedRooms = [];
    const leftRooms = [];
    const client = {
      id: 'socket-5',
      join: (room) => {
        joinedRooms.push(room);
      },
      leave: (room) => {
        leftRooms.push(room);
      },
    };
    const gateway = new BoardGateway({}, {});

    const joinResult = gateway.handleJoinWorkspace(client, { workspaceId: 'ws-123' });
    assert.equal(joinResult.success, true);
    assert.deepEqual(joinedRooms, ['workspace:ws-123']);

    const leaveResult = gateway.handleLeaveWorkspace(client, { workspaceId: 'ws-123' });
    assert.equal(leaveResult.success, true);
    assert.deepEqual(leftRooms, ['workspace:ws-123']);
  });

  it('emits board updates through BoardEventsService to the target workspace room', () => {
    let emittedRoom = '';
    let emittedEventName = '';
    let emittedData = null;

    const fakeServer = {
      to: (room) => ({
        emit: (eventName, data) => {
          emittedRoom = room;
          emittedEventName = eventName;
          emittedData = data;
        },
      }),
    };

    const gateway = new BoardGateway({}, {});
    gateway.server = fakeServer;

    const eventsService = new BoardEventsService(gateway);
    eventsService.emitBoardUpdate('ws-456', 'task.moved', 'task-789', 'user-1', {
      columnId: 'col-done',
    });

    assert.equal(emittedRoom, 'workspace:ws-456');
    assert.equal(emittedEventName, 'board:updated');
    assert.equal(emittedData.workspaceId, 'ws-456');
    assert.equal(emittedData.eventType, 'task.moved');
    assert.equal(emittedData.entityId, 'task-789');
    assert.equal(emittedData.actorId, 'user-1');
    assert.deepEqual(emittedData.payload, { columnId: 'col-done' });
    assert.match(emittedData.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  });
});
