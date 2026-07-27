import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { assertEstimate } from '../common/estimate';
import { estimateData } from '../common/dto/estimate.dto';
import { LocalFileStorage } from '../infrastructure/storage/local-file-storage.service';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { CreateSubtaskDto } from './dto/create-subtask.dto';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { MoveSubtaskDto } from './dto/move-subtask.dto';
import type { MoveTaskDto } from './dto/move-task.dto';
import type { ReorderSubtasksDto } from './dto/reorder-subtasks.dto';
import type { TaskQueryDto } from './dto/task-query.dto';
import type { UpdateSubtaskDto } from './dto/update-subtask.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import { pickBacklogColumnId } from './task-work';

const userSummary = {
  id: true,
  displayName: true,
  avatarSeed: true,
  isActive: true,
} satisfies Prisma.UserSelect;
const attachmentInclude = {
  uploadedBy: { select: userSummary },
} satisfies Prisma.AttachmentInclude;
const taskDetailInclude = {
  column: true,
  sprint: { select: { id: true, name: true, status: true } },
  createdBy: { select: userSummary },
  assignees: { orderBy: { assignedAt: 'asc' }, include: { user: { select: userSummary } } },
  subtasks: {
    orderBy: { position: 'asc' },
    include: {
      assignee: { select: userSummary },
      attachments: { orderBy: { createdAt: 'asc' }, include: attachmentInclude },
    },
  },
  attachments: { orderBy: { createdAt: 'asc' }, include: attachmentInclude },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalFileStorage,
  ) {}

  async list(query: TaskQueryDto) {
    const where = this.filters(query);
    const records = await this.prisma.task.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        column: true,
        assignees: { include: { user: { select: userSummary } } },
        _count: { select: { subtasks: true, attachments: true } },
      },
    });
    const hasMore = records.length > query.limit;
    const items = hasMore ? records.slice(0, query.limit) : records;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  async get(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id }, include: taskDetailInclude });
    if (!task) throw new NotFoundException('Task not found.');
    return this.serializeTask(task);
  }

  async create(input: CreateTaskDto, actorId: string) {
    const title = input.title.trim();
    if (!title) throw new BadRequestException('Task title cannot be empty.');
    assertEstimate(input.estimate);
    const columnId = await this.resolveCreateColumnId(input.columnId);
    await this.assertReferences(columnId, input.assigneeIds ?? [], input.sprintId);
    const task = await this.prisma.$transaction(async (transaction) => {
      const maximum = await transaction.task.aggregate({
        where: { columnId },
        _max: { position: true },
      });
      const created = await transaction.task.create({
        data: {
          title,
          description: input.description?.trim() || null,
          columnId,
          sprintId: input.sprintId ?? null,
          createdById: actorId,
          position: Number(maximum._max.position ?? 0) + 1024,
          ...estimateData(input.estimate),
          assignees: { create: (input.assigneeIds ?? []).map((userId) => ({ userId })) },
        },
        include: taskDetailInclude,
      });
      await this.event(transaction, 'task.created', 'task', created.id, actorId, {
        columnId,
        assigneeIds: input.assigneeIds ?? [],
      });
      return created;
    });
    return this.serializeTask(task);
  }

  async update(id: string, input: UpdateTaskDto, actorId: string) {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found.');
    if (input.title !== undefined && !input.title.trim())
      throw new BadRequestException('Task title cannot be empty.');
    assertEstimate(input.estimate);
    if (input.assigneeIds !== undefined) await this.assertActiveUsers(input.assigneeIds);
    if (input.sprintId !== undefined) {
      await this.assertSprintMembershipChange(existing.sprintId, input.sprintId);
      if (input.sprintId) await this.assertSprint(input.sprintId);
    }
    const task = await this.prisma.$transaction(async (transaction) => {
      if (input.assigneeIds !== undefined) {
        await transaction.taskAssignment.deleteMany({ where: { taskId: id } });
        if (input.assigneeIds.length)
          await transaction.taskAssignment.createMany({
            data: input.assigneeIds.map((userId) => ({ taskId: id, userId })),
          });
      }
      const updated = await transaction.task.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(input.sprintId !== undefined ? { sprintId: input.sprintId } : {}),
          ...(input.estimate !== undefined ? estimateData(input.estimate) : {}),
        },
        include: taskDetailInclude,
      });
      await this.event(transaction, 'task.updated', 'task', id, actorId, {
        fields: Object.keys(input),
      });
      return updated;
    });
    return this.serializeTask(task);
  }

  async move(id: string, input: MoveTaskDto, actorId: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found.');
    if (task.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime())
      throw new ConflictException('This task changed elsewhere. Reload the board and try again.');
    const column = await this.prisma.boardColumn.findUnique({ where: { id: input.columnId } });
    if (!column) throw new BadRequestException('Destination column not found.');
    if (input.beforeTaskId === id || input.afterTaskId === id)
      throw new BadRequestException('A task cannot be positioned relative to itself.');

    return this.prisma.$transaction(async (transaction) => {
      let neighbors = await transaction.task.findMany({
        where: { columnId: input.columnId, id: { not: id } },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });
      const before = input.beforeTaskId
        ? neighbors.find((item) => item.id === input.beforeTaskId)
        : undefined;
      const after = input.afterTaskId
        ? neighbors.find((item) => item.id === input.afterTaskId)
        : undefined;
      if ((input.beforeTaskId && !before) || (input.afterTaskId && !after))
        throw new BadRequestException('Movement neighbors must be in the destination column.');
      if (before && after && Number(before.position) >= Number(after.position))
        throw new BadRequestException('Movement neighbors are out of order.');
      let position =
        before && after
          ? (Number(before.position) + Number(after.position)) / 2
          : before
            ? Number(before.position) + 1024
            : after
              ? Number(after.position) / 2
              : 1024;
      if (
        !Number.isFinite(position) ||
        (before && after && Number(after.position) - Number(before.position) < 0.0001)
      ) {
        for (const [index, item] of neighbors.entries())
          await transaction.task.update({
            where: { id: item.id },
            data: { position: (index + 1) * 1024 },
          });
        neighbors = await transaction.task.findMany({
          where: { columnId: input.columnId, id: { not: id } },
          orderBy: { position: 'asc' },
          select: { id: true, position: true },
        });
        const normalizedBefore = input.beforeTaskId
          ? neighbors.find((item) => item.id === input.beforeTaskId)
          : undefined;
        const normalizedAfter = input.afterTaskId
          ? neighbors.find((item) => item.id === input.afterTaskId)
          : undefined;
        position =
          normalizedBefore && normalizedAfter
            ? (Number(normalizedBefore.position) + Number(normalizedAfter.position)) / 2
            : normalizedBefore
              ? Number(normalizedBefore.position) + 1024
              : normalizedAfter
                ? Number(normalizedAfter.position) / 2
                : 1024;
      }
      await transaction.subtask.updateMany({
        where: { taskId: id, columnId: task.columnId },
        data: { columnId: input.columnId },
      });
      const updated = await transaction.task.update({
        where: { id },
        data: { columnId: input.columnId, position },
        include: {
          assignees: { include: { user: { select: userSummary } } },
          subtasks: { select: { id: true, isCompleted: true } },
          _count: { select: { attachments: true } },
        },
      });
      await this.event(transaction, 'task.moved', 'task', id, actorId, {
        fromColumnId: task.columnId,
        toColumnId: input.columnId,
        position,
      });
      return updated;
    });
  }

  async remove(id: string, actorId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        attachments: { select: { storageKey: true } },
        subtasks: { include: { attachments: { select: { storageKey: true } } } },
      },
    });
    if (!task) throw new NotFoundException('Task not found.');
    const keys = [
      ...task.attachments.map((item) => item.storageKey),
      ...task.subtasks.flatMap((subtask) => subtask.attachments.map((item) => item.storageKey)),
    ];
    await this.prisma.$transaction(async (transaction) => {
      await transaction.task.delete({ where: { id } });
      await this.event(transaction, 'task.deleted', 'task', id, actorId, {
        attachmentCount: keys.length,
      });
    });
    await Promise.all(keys.map((key) => this.storage.delete(key)));
  }

  async createSubtask(taskId: string, input: CreateSubtaskDto, actorId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, columnId: true },
    });
    if (!task) throw new NotFoundException('Task not found.');
    if (!input.title.trim()) throw new BadRequestException('Subtask title cannot be empty.');
    assertEstimate(input.estimate);
    if (input.assigneeId) await this.assertActiveUsers([input.assigneeId]);
    const subtask = await this.prisma.$transaction(async (transaction) => {
      const maximum = await transaction.subtask.aggregate({
        where: { taskId },
        _max: { position: true },
      });
      const created = await transaction.subtask.create({
        data: {
          taskId,
          columnId: task.columnId,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          assigneeId: input.assigneeId ?? null,
          createdById: actorId,
          position: (maximum._max.position ?? -1) + 1,
          ...estimateData(input.estimate),
        },
        include: { assignee: { select: userSummary }, attachments: { include: attachmentInclude } },
      });
      await this.event(transaction, 'subtask.created', 'subtask', created.id, actorId, { taskId });
      return created;
    });
    return this.serializeSubtask(subtask);
  }

  async updateSubtask(taskId: string, id: string, input: UpdateSubtaskDto, actorId: string) {
    const existing = await this.prisma.subtask.findFirst({ where: { id, taskId } });
    if (!existing) throw new NotFoundException('Subtask not found.');
    if (input.title !== undefined && !input.title.trim())
      throw new BadRequestException('Subtask title cannot be empty.');
    assertEstimate(input.estimate);
    if (input.assigneeId) await this.assertActiveUsers([input.assigneeId]);
    const subtask = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.subtask.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
          ...(input.isCompleted !== undefined ? { isCompleted: input.isCompleted } : {}),
          ...(input.estimate !== undefined ? estimateData(input.estimate) : {}),
        },
        include: {
          assignee: { select: userSummary },
          attachments: { orderBy: { createdAt: 'asc' }, include: attachmentInclude },
        },
      });
      await this.event(transaction, 'subtask.updated', 'subtask', id, actorId, {
        taskId,
        fields: Object.keys(input),
      });
      return updated;
    });
    return this.serializeSubtask(subtask);
  }

  async moveSubtask(taskId: string, id: string, input: MoveSubtaskDto, actorId: string) {
    const subtask = await this.prisma.subtask.findFirst({ where: { id, taskId } });
    if (!subtask) throw new NotFoundException('Subtask not found.');
    if (subtask.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime())
      throw new ConflictException(
        'This subtask changed elsewhere. Reload the board and try again.',
      );
    const column = await this.prisma.boardColumn.findUnique({ where: { id: input.columnId } });
    if (!column) throw new BadRequestException('Destination column not found.');
    if (subtask.columnId === input.columnId) {
      return this.prisma.subtask.findUniqueOrThrow({
        where: { id },
        include: {
          assignee: { select: userSummary },
          attachments: { orderBy: { createdAt: 'asc' }, include: attachmentInclude },
        },
      }).then((item) => this.serializeSubtask(item));
    }
    const updated = await this.prisma.$transaction(async (transaction) => {
      const moved = await transaction.subtask.update({
        where: { id },
        data: { columnId: input.columnId },
        include: {
          assignee: { select: userSummary },
          attachments: { orderBy: { createdAt: 'asc' }, include: attachmentInclude },
        },
      });
      await this.event(transaction, 'subtask.moved', 'subtask', id, actorId, {
        taskId,
        columnId: input.columnId,
      });
      return moved;
    });
    return this.serializeSubtask(updated);
  }

  async reorderSubtasks(taskId: string, input: ReorderSubtasksDto, actorId: string) {
    await this.assertTask(taskId);
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.subtask.findMany({
        where: { taskId },
        select: { id: true },
      });
      if (
        existing.length !== input.subtaskIds.length ||
        existing.some((item) => !input.subtaskIds.includes(item.id))
      )
        throw new BadRequestException('The order must contain every subtask exactly once.');
      for (const [position, id] of input.subtaskIds.entries())
        await transaction.subtask.update({ where: { id }, data: { position } });
      await this.event(transaction, 'subtask.reordered', 'task', taskId, actorId, {
        subtaskIds: input.subtaskIds,
      });
      return transaction.subtask.findMany({
        where: { taskId },
        orderBy: { position: 'asc' },
        include: { assignee: { select: userSummary }, attachments: { include: attachmentInclude } },
      });
    });
  }

  async removeSubtask(taskId: string, id: string, actorId: string) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id, taskId },
      include: { attachments: { select: { storageKey: true } } },
    });
    if (!subtask) throw new NotFoundException('Subtask not found.');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.subtask.delete({ where: { id } });
      await this.event(transaction, 'subtask.deleted', 'subtask', id, actorId, { taskId });
    });
    await Promise.all(subtask.attachments.map((item) => this.storage.delete(item.storageKey)));
  }

  private filters(query: TaskQueryDto): Prisma.TaskWhereInput {
    return {
      ...(query.search?.trim()
        ? {
            OR: [
              { title: { contains: query.search.trim(), mode: 'insensitive' } },
              { description: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.columnId ? { columnId: query.columnId } : {}),
      ...(query.sprintId ? { sprintId: query.sprintId } : {}),
      ...(query.assigneeId ? { assignees: { some: { userId: query.assigneeId } } } : {}),
      ...(query.unassigned ? { assignees: { none: {} } } : {}),
      ...(query.hasEstimate === true ? { estimateValue: { not: null } } : {}),
      ...(query.hasEstimate === false ? { estimateValue: null } : {}),
    };
  }

  private async resolveCreateColumnId(requestedColumnId?: string) {
    const columns = await this.prisma.boardColumn.findMany({
      select: { id: true, isBacklog: true, position: true },
      orderBy: { position: 'asc' },
    });
    const backlogId = pickBacklogColumnId(columns);
    if (!backlogId) throw new BadRequestException('No board columns are configured.');
    if (requestedColumnId && requestedColumnId !== backlogId) {
      throw new BadRequestException('New tasks can only be created in the backlog.');
    }
    return backlogId;
  }

  private async assertReferences(
    columnId: string,
    assigneeIds: string[],
    sprintId?: string | null,
  ) {
    const column = await this.prisma.boardColumn.findUnique({ where: { id: columnId } });
    if (!column) throw new BadRequestException('Board column not found.');
    await this.assertActiveUsers(assigneeIds);
    if (sprintId) await this.assertSprint(sprintId);
  }

  private async assertActiveUsers(ids: string[]) {
    if (!ids.length) return;
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Assignees must be unique.');
    const count = await this.prisma.user.count({ where: { id: { in: ids }, isActive: true } });
    if (count !== ids.length)
      throw new BadRequestException('Every assignee must be an active user.');
  }

  private async assertSprint(id: string) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id }, select: { status: true } });
    if (!sprint) throw new BadRequestException('Sprint not found.');
    if (sprint.status === 'COMPLETED')
      throw new BadRequestException('Tasks cannot be added to a completed sprint.');
  }

  private async assertSprintMembershipChange(currentSprintId: string | null, nextSprintId: string | null) {
    if (!currentSprintId || currentSprintId === nextSprintId) return;
    const current = await this.prisma.sprint.findUnique({
      where: { id: currentSprintId },
      select: { status: true },
    });
    if (current && current.status !== 'PLANNED')
      throw new BadRequestException(
        'Tasks in an active or completed sprint cannot be reassigned outside the sprint lifecycle.',
      );
  }

  private async assertTask(id: string) {
    if (!(await this.prisma.task.findUnique({ where: { id }, select: { id: true } })))
      throw new NotFoundException('Task not found.');
  }

  private event(
    transaction: Prisma.TransactionClient,
    eventType: string,
    entityType: string,
    entityId: string,
    actorId: string,
    details: object,
  ) {
    return transaction.activityEvent.create({
      data: { eventType, entityType, entityId, actorId, payload: { version: 1, ...details } },
    });
  }

  private serializeTask<
    T extends {
      attachments: Array<{ sizeBytes: bigint; storageKey: string; uploadedById: string }>;
      subtasks: Array<{
        attachments: Array<{ sizeBytes: bigint; storageKey: string; uploadedById: string }>;
      }>;
    },
  >(task: T) {
    return {
      ...task,
      attachments: task.attachments.map((item) => this.serializeAttachment(item)),
      subtasks: task.subtasks.map((subtask) => this.serializeSubtask(subtask)),
    };
  }

  private serializeSubtask<
    T extends {
      attachments: Array<{ sizeBytes: bigint; storageKey: string; uploadedById: string }>;
    },
  >(subtask: T) {
    return {
      ...subtask,
      attachments: subtask.attachments.map((item) => this.serializeAttachment(item)),
    };
  }

  private serializeAttachment<
    T extends { sizeBytes: bigint; storageKey: string; uploadedById: string },
  >(attachment: T) {
    const safe = Object.fromEntries(
      Object.entries(attachment).filter(([key]) => key !== 'storageKey' && key !== 'uploadedById'),
    );
    return { ...safe, sizeBytes: Number(attachment.sizeBytes) };
  }
}
