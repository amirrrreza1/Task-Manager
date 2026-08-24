import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { BoardQueryDto } from './dto/board-query.dto';
import type { CreateColumnDto } from './dto/create-column.dto';
import type { ReorderColumnsDto } from './dto/reorder-columns.dto';
import type { UpdateColumnDto } from './dto/update-column.dto';

const taskCardInclude = {
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
            select: { id: true, displayName: true, color: true, hasAvatar: true, isActive: true },
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
  constructor(private readonly prisma: PrismaService) {}

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

    const taskWhere: Prisma.TaskWhereInput = {
      workspaceId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              { title: { contains: query.search.trim(), mode: 'insensitive' } },
              { description: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.assigneeId ? { assignees: { some: { userId: query.assigneeId } } } : {}),
      ...(query.sprintId ? { sprintId: query.sprintId } : {}),
      ...(query.unassigned ? { assignees: { none: {} } } : {}),
      ...(query.hasEstimate === true ? { estimateValue: { not: null } } : {}),
      ...(query.hasEstimate === false ? { estimateValue: null } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    };
    const subtaskWhere: Prisma.SubtaskWhereInput = {
      task: {
        workspaceId,
        ...(query.projectId ? { projectId: query.projectId } : {}),
      },
      ...(query.search?.trim()
        ? {
            OR: [
              { title: { contains: query.search.trim(), mode: 'insensitive' } },
              { description: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.sprintId
        ? {
            task: {
              sprintId: query.sprintId,
              workspaceId,
              ...(query.projectId ? { projectId: query.projectId } : {}),
            },
          }
        : {}),
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

    return this.prisma.$transaction(async (transaction) => {
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
    return this.prisma.$transaction(async (transaction) => {
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
  }

  async reorder(input: ReorderColumnsDto, actor: AuthenticatedUser) {
    if (new Set(input.columnIds).size !== input.columnIds.length)
      throw new BadRequestException('Column IDs must be unique.');
    if (input.columnIds.length === 0) throw new BadRequestException('Column IDs cannot be empty.');

    return this.prisma.$transaction(async (transaction) => {
      const firstColumn = await transaction.boardColumn.findUnique({
        where: { id: input.columnIds[0] },
      });
      if (!firstColumn) throw new NotFoundException('Board column not found.');
      const workspaceId = firstColumn.workspaceId;

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
  }

  async remove(id: string, moveTasksTo: string | undefined, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (transaction) => {
      const target = await transaction.boardColumn.findUnique({ where: { id } });
      if (!target) throw new NotFoundException('Board column not found.');
      if (target.isTodo || target.isDone)
        throw new BadRequestException('The To Do and Done columns cannot be deleted.');
      if (target.isBacklog) throw new BadRequestException('The backlog column cannot be deleted.');

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
