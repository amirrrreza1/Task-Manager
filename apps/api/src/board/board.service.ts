import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SprintStatus } from '@prisma/client';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BoardEventsService } from './board-events.service';
import type { BoardQueryDto } from './dto/board-query.dto';
import type { CreateColumnDto } from './dto/create-column.dto';
import type { ReorderColumnsDto } from './dto/reorder-columns.dto';
import type { UpdateColumnDto } from './dto/update-column.dto';
import { getShortId } from '../common/task-id';

const taskCardInclude = {
  projects: {
    orderBy: { assignedAt: 'asc' },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          key: true,
          color: true,
          icon: true,
          seniors: {
            orderBy: { assignedAt: 'asc' },
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  color: true,
                  hasAvatar: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
    },
  },
  assignees: {
    orderBy: { assignedAt: 'asc' },
    include: {
      user: {
        select: { id: true, displayName: true, color: true, hasAvatar: true, isActive: true },
      },
    },
  },
  subtasks: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      taskId: true,
      columnId: true,
      title: true,
      description: true,
      priority: true,
      estimateValue: true,
      estimateUnit: true,
      isCompleted: true,
      position: true,
      assigneeId: true,
      createdAt: true,
      updatedAt: true,
      assignee: {
        select: { id: true, displayName: true, color: true, hasAvatar: true, isActive: true },
      },
      _count: { select: { attachments: true } },
    },
  },
  _count: { select: { attachments: true } },
} satisfies Prisma.TaskInclude;

@Injectable()
export class BoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events?: BoardEventsService,
  ) {}

  private async resolveWorkspaceId(workspaceId?: string): Promise<string> {
    if (workspaceId) {
      const exists = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (exists) return exists.id;
    }
    const first = await this.prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' } });
    if (first) return first.id;
    const defaultWs = await this.prisma.workspace.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Main Workspace',
        description: 'Default team workspace',
      },
    });
    return defaultWs.id;
  }

  async listColumns(workspaceId?: string) {
    const wsId = await this.resolveWorkspaceId(workspaceId);
    return this.prisma.boardColumn.findMany({
      where: { workspaceId: wsId },
      orderBy: { position: 'asc' },
    });
  }

  async read(query: BoardQueryDto) {
    if (query.excludeBacklog && query.backlogOnly) {
      throw new BadRequestException('Choose either excludeBacklog or backlogOnly, not both.');
    }
    const workspaceId = await this.resolveWorkspaceId(query.workspaceId);

    const sprintFilter: Prisma.TaskWhereInput = query.sprintId
      ? { sprintId: query.sprintId }
      : query.includeCompletedSprints
        ? {}
        : {
            OR: [
              { sprintId: null },
              { sprint: { status: { not: SprintStatus.COMPLETED } } },
            ],
          };

    const searchRaw = query.search?.trim() ?? '';
    const searchTrim = searchRaw.replace(/^#/, '');
    let taskIdMatches: string[] = [];
    let subtaskIdMatches: string[] = [];
    if (searchTrim) {
      if (
        /^[0-9a-fA-F-]{4,36}$/.test(searchTrim) &&
        typeof (this.prisma as unknown as { $queryRaw?: unknown }).$queryRaw === 'function'
      ) {
        try {
          const rawTasks = await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM "Task" WHERE id::text ILIKE ${'%' + searchTrim + '%'} LIMIT 100
          `;
          taskIdMatches = rawTasks.map((r) => r.id);
          const rawSubtasks = await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM "Subtask" WHERE id::text ILIKE ${'%' + searchTrim + '%'} LIMIT 100
          `;
          subtaskIdMatches = rawSubtasks.map((r) => r.id);
        } catch {
          // Fallback gracefully if raw query unsupported in tests
        }
      }

      if (/^\d{3,10}$/.test(searchTrim) || /^[A-Za-z0-9]+-\d{3,10}$/.test(searchTrim)) {
        const numericTerm = searchTrim.includes('-') ? searchTrim.split('-').pop()! : searchTrim;
        try {
          const wsTasks = await this.prisma.task.findMany({
            where: { workspaceId },
            select: { id: true },
          });
          for (const t of wsTasks) {
            if (getShortId(t.id).includes(numericTerm) && !taskIdMatches.includes(t.id)) {
              taskIdMatches.push(t.id);
            }
          }
          const wsSubtasks = await this.prisma.subtask.findMany({
            where: { task: { workspaceId } },
            select: { id: true },
          });
          for (const s of wsSubtasks) {
            if (getShortId(s.id).includes(numericTerm) && !subtaskIdMatches.includes(s.id)) {
              subtaskIdMatches.push(s.id);
            }
          }
        } catch {
          // Fallback gracefully
        }
      }
    }

    const taskWhere: Prisma.TaskWhereInput = {
      workspaceId,
      ...sprintFilter,
      ...(query.projectId ? { projects: { some: { projectId: query.projectId } } } : {}),
      ...(searchRaw
        ? {
            OR: [
              { title: { contains: searchRaw, mode: 'insensitive' } },
              { description: { contains: searchRaw, mode: 'insensitive' } },
              ...(taskIdMatches.length > 0 ? [{ id: { in: taskIdMatches } }] : []),
            ],
          }
        : {}),
      ...(query.assigneeId ? { assignees: { some: { userId: query.assigneeId } } } : {}),
      ...(query.unassigned ? { assignees: { none: {} } } : {}),
      ...(query.hasEstimate === true ? { estimateValue: { not: null } } : {}),
      ...(query.hasEstimate === false ? { estimateValue: null } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    };
    const subtaskWhere: Prisma.SubtaskWhereInput = {
      task: {
        workspaceId,
        ...(query.projectId ? { projects: { some: { projectId: query.projectId } } } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.sprintId
          ? { sprintId: query.sprintId }
          : query.includeCompletedSprints
            ? {}
            : {
                OR: [
                  { sprintId: null },
                  { sprint: { status: { not: SprintStatus.COMPLETED } } },
                ],
              }),
      },
      ...(query.sprintId
        ? {
            OR: [
              { sprintId: query.sprintId },
              { sprintId: null, task: { sprintId: query.sprintId } },
            ],
          }
        : query.includeCompletedSprints
          ? {}
          : {
              OR: [
                { sprintId: null },
                { sprint: { status: { not: SprintStatus.COMPLETED } } },
              ],
            }),
      ...(searchRaw
        ? {
            OR: [
              { title: { contains: searchRaw, mode: 'insensitive' } },
              { description: { contains: searchRaw, mode: 'insensitive' } },
              ...(subtaskIdMatches.length > 0 ? [{ id: { in: subtaskIdMatches } }] : []),
            ],
          }
        : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.unassigned ? { assigneeId: null } : {}),
      ...(query.hasEstimate === true ? { estimateValue: { not: null } } : {}),
      ...(query.hasEstimate === false ? { estimateValue: null } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    };
    const columnScope: Prisma.BoardColumnWhereInput = {
      workspaceId,
      ...(query.excludeBacklog ? { isBacklog: false } : {}),
      ...(query.backlogOnly ? { isBacklog: true } : {}),
    };
    const [columns, matchingSubtasks, workspace] = await this.prisma.$transaction([
      this.prisma.boardColumn.findMany({
        where: columnScope,
        orderBy: { position: 'asc' },
        include: {
          tasks: { where: taskWhere, orderBy: { position: 'asc' }, include: taskCardInclude },
        },
      }),
      this.prisma.subtask.findMany({
        where: subtaskWhere,
        orderBy: { position: 'asc' },
        select: {
          id: true,
          taskId: true,
          columnId: true,
          title: true,
          description: true,
          priority: true,
          estimateValue: true,
          estimateUnit: true,
          isCompleted: true,
          position: true,
          assigneeId: true,
          createdAt: true,
          updatedAt: true,
          assignee: {
            select: {
              id: true,
              displayName: true,
              color: true,
              hasAvatar: true,
              isActive: true,
            },
          },
          _count: { select: { attachments: true } },
          task: { select: { id: true, title: true, columnId: true } },
        },
      }),
      this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    ]);
    const visibleTaskIds = new Set(
      columns.flatMap((column) => column.tasks.map((task) => task.id)),
    );

    return {
      columns: columns.map((column) => ({
        ...column,
        tasks: column.tasks.map((task) => ({
          ...task,
          subtasks: task.subtasks.filter((subtask) => subtask.columnId === column.id),
        })),
        subtasks: matchingSubtasks
          .filter(
            (subtask) =>
              subtask.columnId === column.id &&
              (subtask.task.columnId !== column.id || !visibleTaskIds.has(subtask.taskId)),
          )
          .map(({ task, ...subtask }) => ({
            ...subtask,
            parentTask: { id: task.id, title: task.title },
          })),
      })),
      settings: {
        id: workspace.id,
        estimateMode: workspace.estimateMode,
        sprintDurationDays: workspace.sprintDurationDays,
        revision: 1,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      },
    };
  }

  async create(input: CreateColumnDto, actor: AuthenticatedUser) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Column name cannot be empty.');
    const workspaceId = await this.resolveWorkspaceId(input.workspaceId);

    const result = await this.prisma.$transaction(async (transaction) => {
      const columns = await transaction.boardColumn.findMany({
        where: { workspaceId },
        orderBy: { position: 'asc' },
      });
      const doneColumn = columns.find((column) => column.isDone);
      if (!doneColumn) throw new BadRequestException('The Done column is not configured.');
      const isReview = input.isReview ?? name.toLowerCase().includes('review');
      const column = await transaction.boardColumn.create({
        data: {
          workspaceId,
          name,
          color: input.color.toUpperCase(),
          position: (columns.at(-1)?.position ?? -1) + 1,
          isReview,
        },
      });
      const columnIds = [
        ...columns.filter((item) => item.id !== doneColumn.id).map((item) => item.id),
        column.id,
        doneColumn.id,
      ];
      await this.setColumnOrder(transaction, columnIds);
      await this.event(transaction, 'board_column.created', column.id, actor.id, {
        name,
        workspaceId,
      });
      return transaction.boardColumn.findUniqueOrThrow({ where: { id: column.id } });
    });
    this.events?.emitBoardUpdate(workspaceId, 'column.created', result.id, actor.id, {
      name: result.name,
    });
    return result;
  }

  async update(id: string, input: UpdateColumnDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.boardColumn.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Board column not found.');
    if (existing.isTodo || existing.isDone) {
      throw new BadRequestException('The To Do and Done columns are fixed and cannot be edited.');
    }
    if (existing.isBacklog)
      throw new BadRequestException('The backlog column is managed automatically.');
    if (input.name !== undefined && !input.name.trim())
      throw new BadRequestException('Column name cannot be empty.');
    const updated = await this.prisma.$transaction(async (transaction) => {
      const column = await transaction.boardColumn.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.color !== undefined ? { color: input.color.toUpperCase() } : {}),
          ...(input.isReview !== undefined ? { isReview: input.isReview } : {}),
        },
      });
      await this.event(transaction, 'board_column.updated', id, actor.id, {
        fields: Object.keys(input),
      });
      return column;
    });
    this.events?.emitBoardUpdate(existing.workspaceId, 'column.updated', id, actor.id);
    return updated;
  }

  async reorder(input: ReorderColumnsDto, actor: AuthenticatedUser) {
    if (new Set(input.columnIds).size !== input.columnIds.length)
      throw new BadRequestException('Column IDs must be unique.');
    if (input.columnIds.length === 0) throw new BadRequestException('Column IDs cannot be empty.');

    const firstColumn = await this.prisma.boardColumn.findUnique({
      where: { id: input.columnIds[0] },
    });
    if (!firstColumn) throw new NotFoundException('Board column not found.');
    const workspaceId = firstColumn.workspaceId;

    const reordered = await this.prisma.$transaction(async (transaction) => {
      const columns = await transaction.boardColumn.findMany({
        where: { workspaceId },
        orderBy: { position: 'asc' },
        select: { id: true, isBacklog: true, isTodo: true, isDone: true },
      });
      if (
        columns.length !== input.columnIds.length ||
        columns.some((column) => !input.columnIds.includes(column.id))
      ) {
        throw new BadRequestException('The order must contain every board column exactly once.');
      }
      const backlogIds = columns.filter((column) => column.isBacklog).map((column) => column.id);
      const workflowIds = input.columnIds.filter((id) => !backlogIds.includes(id));
      const todoColumn = columns.find((column) => column.isTodo);
      const doneColumn = columns.find((column) => column.isDone);
      const requestedBacklogIds = input.columnIds.slice(0, backlogIds.length);
      if (
        !todoColumn ||
        !doneColumn ||
        requestedBacklogIds.some((id, index) => id !== backlogIds[index]) ||
        workflowIds[0] !== todoColumn.id ||
        workflowIds.at(-1) !== doneColumn.id
      ) {
        throw new BadRequestException(
          'To Do must remain first and Done must remain last in the workflow.',
        );
      }
      await this.setColumnOrder(transaction, input.columnIds);
      await this.event(transaction, 'board_column.reordered', input.columnIds[0], actor.id, {
        columnIds: input.columnIds,
        workspaceId,
      });
      return transaction.boardColumn.findMany({
        where: { workspaceId },
        orderBy: { position: 'asc' },
      });
    });
    this.events?.emitBoardUpdate(workspaceId, 'column.reordered', undefined, actor.id, {
      columnIds: input.columnIds,
    });
    return reordered;
  }

  async remove(id: string, moveTasksTo: string | undefined, actor: AuthenticatedUser) {
    const target = await this.prisma.boardColumn.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Board column not found.');
    if (target.isTodo || target.isDone)
      throw new BadRequestException('The To Do and Done columns cannot be deleted.');
    if (target.isBacklog) throw new BadRequestException('The backlog column cannot be deleted.');

    await this.prisma.$transaction(async (transaction) => {
      const columns = await transaction.boardColumn.findMany({
        where: { workspaceId: target.workspaceId },
        orderBy: { position: 'asc' },
      });

      const taskCount = await transaction.task.count({ where: { columnId: id } });
      const subtaskCount = await transaction.subtask.count({ where: { columnId: id } });
      if (taskCount > 0 || subtaskCount > 0) {
        if (!moveTasksTo || moveTasksTo === id)
          throw new ConflictException('Choose a destination for tasks in this column.');
        const destination = columns.find((candidate) => candidate.id === moveTasksTo);
        if (!destination) throw new BadRequestException('Destination column not found.');
        if (taskCount > 0) {
          const maximum = await transaction.task.aggregate({
            where: { columnId: moveTasksTo },
            _max: { position: true },
          });
          const moving = await transaction.task.findMany({
            where: { columnId: id },
            orderBy: { position: 'asc' },
            select: { id: true },
          });
          let position = Number(maximum._max.position ?? 0);
          for (const task of moving) {
            position += 1024;
            await transaction.task.update({
              where: { id: task.id },
              data: { columnId: moveTasksTo, position },
            });
          }
        }
        await transaction.subtask.updateMany({
          where: { columnId: id },
          data: { columnId: moveTasksTo },
        });
      }
      await transaction.boardColumn.delete({ where: { id } });
      const remaining = columns.filter((candidate) => candidate.id !== id);
      await this.setColumnOrder(
        transaction,
        remaining.map((item) => item.id),
      );
      await this.event(transaction, 'board_column.deleted', id, actor.id, {
        movedTaskCount: taskCount,
        destinationColumnId: moveTasksTo ?? null,
        workspaceId: target.workspaceId,
      });
    });
    this.events?.emitBoardUpdate(target.workspaceId, 'column.deleted', id, actor.id);
  }

  private async setColumnOrder(transaction: Prisma.TransactionClient, columnIds: string[]) {
    await transaction.boardColumn.updateMany({
      where: { id: { in: columnIds } },
      data: { position: { increment: 10_000 } },
    });
    for (const [position, id] of columnIds.entries()) {
      await transaction.boardColumn.update({ where: { id }, data: { position } });
    }
  }

  private event(
    transaction: Prisma.TransactionClient,
    eventType: string,
    entityId: string,
    actorId: string,
    details: object,
  ) {
    return transaction.activityEvent.create({
      data: {
        eventType,
        entityType: 'board_column',
        entityId,
        actorId,
        payload: { version: 1, ...details },
      },
    });
  }
}
