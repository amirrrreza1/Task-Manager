import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstimateMode, UserRole, type Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { assertEstimate, assertEstimateMatchesMode } from '../common/estimate';
import { estimateData, type EstimateDto } from '../common/dto/estimate.dto';
import { LocalFileStorage } from '../infrastructure/storage/local-file-storage.service';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateSubtaskDto } from './dto/create-subtask.dto';
import type { CommentDto } from './dto/comment.dto';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { MoveSubtaskDto } from './dto/move-subtask.dto';
import type { MoveTaskDto } from './dto/move-task.dto';
import type { ReorderSubtasksDto } from './dto/reorder-subtasks.dto';
import type { TaskQueryDto } from './dto/task-query.dto';
import type { UpdateSubtaskDto } from './dto/update-subtask.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import { pickBacklogColumnId, pickTodoColumnId } from './task-work';

const userSummary = {
  id: true,
  displayName: true,
  color: true,
  hasAvatar: true,
  isActive: true,
} satisfies Prisma.UserSelect;
const projectSelect = {
  id: true,
  name: true,
  key: true,
  color: true,
  icon: true,
  seniors: {
    orderBy: { assignedAt: 'asc' },
    include: { user: { select: userSummary } },
  },
} satisfies Prisma.ProjectSelect;
const attachmentInclude = {
  uploadedBy: { select: userSummary },
} satisfies Prisma.AttachmentInclude;
const taskDetailInclude = {
  column: true,
  project: { select: projectSelect },
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
  comments: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { author: { select: userSummary } },
  },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalFileStorage,
    private readonly notifications: NotificationsService,
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

  async list(query: TaskQueryDto) {
    const where = this.filters(query);
    const records = await this.prisma.task.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        column: true,
        project: { select: projectSelect },
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

  async getSubtask(taskId: string, id: string) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id, taskId },
      include: {
        task: { select: { id: true, title: true, workspaceId: true } },
        column: true,
        sprint: { select: { id: true, name: true, status: true } },
        createdBy: { select: userSummary },
        assignee: { select: userSummary },
        attachments: { orderBy: { createdAt: 'asc' }, include: attachmentInclude },
        comments: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { author: { select: userSummary } },
        },
      },
    });
    if (!subtask) throw new NotFoundException('Subtask not found.');
    return this.serializeSubtask(subtask);
  }

  async create(input: CreateTaskDto, actorId: string) {
    const title = input.title.trim();
    if (!title) throw new BadRequestException('Task title cannot be empty.');

    let resolvedWorkspaceId = input.workspaceId;
    if (!resolvedWorkspaceId && input.columnId) {
      const col = await this.prisma.boardColumn.findUnique({ where: { id: input.columnId } });
      if (col) resolvedWorkspaceId = col.workspaceId;
    }
    if (!resolvedWorkspaceId && input.sprintId) {
      const spr = await this.prisma.sprint.findUnique({ where: { id: input.sprintId } });
      if (spr) resolvedWorkspaceId = spr.workspaceId;
    }
    const workspaceId = await this.resolveWorkspaceId(resolvedWorkspaceId);

    if (input.projectId) {
      const proj = await this.prisma.project.findUnique({ where: { id: input.projectId } });
      if (!proj || proj.workspaceId !== workspaceId) {
        throw new BadRequestException('Project not found in this workspace.');
      }
    }

    await this.assertWorkspaceEstimate(input.estimate, workspaceId);
    const columnId = await this.resolveCreateColumnId(
      workspaceId,
      input.columnId,
      Boolean(input.sprintId),
    );
    await this.assertReferences(columnId, input.assigneeIds ?? [], input.sprintId);
    const task = await this.prisma.$transaction(async (transaction) => {
      const maximum = await transaction.task.aggregate({
        where: { columnId },
        _max: { position: true },
      });
      const created = await transaction.task.create({
        data: {
          workspaceId,
          projectId: input.projectId ?? null,
          title,
          description: input.description?.trim() || null,
          columnId,
          sprintId: input.sprintId ?? null,
          createdById: actorId,
          position: Number(maximum._max.position ?? 0) + 1024,
          ...(input.priority ? { priority: input.priority } : {}),
          ...estimateData(input.estimate),
          assignees: { create: (input.assigneeIds ?? []).map((userId) => ({ userId })) },
        },
        include: taskDetailInclude,
      });
      await this.event(transaction, 'task.created', 'task', created.id, actorId, {
        columnId,
        assigneeIds: input.assigneeIds ?? [],
        workspaceId,
        projectId: input.projectId ?? null,
      });
      return created;
    });

    if (input.assigneeIds && input.assigneeIds.length > 0) {
      void this.notifications.dispatch({
        recipientUserIds: input.assigneeIds,
        actorId,
        type: 'task.assigned',
        title: `📋 Task Assigned: ${task.title}`,
        message: `You were assigned to "${task.title}".`,
        lines: [
          `You were assigned to the task "${task.title}".`,
          task.description ? `Description: ${task.description}` : '',
        ].filter(Boolean),
        link: `/tasks/${task.id}`,
        actionLabel: 'View Task',
      });
    }

    return this.serializeTask(task);
  }

  async update(id: string, input: UpdateTaskDto, actorId: string) {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      include: { assignees: { select: { userId: true } } },
    });
    if (!existing) throw new NotFoundException('Task not found.');
    if (input.title !== undefined && !input.title.trim())
      throw new BadRequestException('Task title cannot be empty.');
    await this.assertWorkspaceEstimate(input.estimate, existing.workspaceId);
    if (input.projectId) {
      const proj = await this.prisma.project.findUnique({ where: { id: input.projectId } });
      if (!proj || proj.workspaceId !== existing.workspaceId) {
        throw new BadRequestException('Project not found in this workspace.');
      }
    }
    if (input.assigneeIds !== undefined) await this.assertActiveUsers(input.assigneeIds);
    if (input.sprintId !== undefined) {
      await this.assertSprintMembershipChange(existing.sprintId, input.sprintId);
      if (input.sprintId) await this.assertSprint(input.sprintId);
    }
    const todoColumnId =
      input.sprintId && input.sprintId !== existing.sprintId
        ? await this.resolveTodoColumnId(existing.workspaceId)
        : null;
    const task = await this.prisma.$transaction(async (transaction) => {
      if (input.assigneeIds !== undefined) {
        await transaction.taskAssignment.deleteMany({ where: { taskId: id } });
        if (input.assigneeIds.length)
          await transaction.taskAssignment.createMany({
            data: input.assigneeIds.map((userId) => ({ taskId: id, userId })),
          });
      }
      let sprintPosition = 0;
      if (todoColumnId) {
        const maximum = await transaction.task.aggregate({
          where: { columnId: todoColumnId },
          _max: { position: true },
        });
        sprintPosition = Number(maximum._max.position ?? 0) + 1024;
        await transaction.subtask.updateMany({
          where: { taskId: id, columnId: existing.columnId },
          data: { columnId: todoColumnId },
        });
      }
      const updated = await transaction.task.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
          ...(input.sprintId !== undefined ? { sprintId: input.sprintId } : {}),
          ...(todoColumnId ? { columnId: todoColumnId, position: sprintPosition } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.estimate !== undefined ? estimateData(input.estimate) : {}),
        },
        include: taskDetailInclude,
      });
      await this.event(transaction, 'task.updated', 'task', id, actorId, {
        fields: Object.keys(input),
      });
      return updated;
    });

    if (input.assigneeIds !== undefined) {
      const prevIds = existing.assignees.map((a) => a.userId);
      const newlyAssigned = input.assigneeIds.filter((uid) => !prevIds.includes(uid));
      const unassigned = prevIds.filter((uid) => !input.assigneeIds!.includes(uid));

      if (newlyAssigned.length > 0) {
        void this.notifications.dispatch({
          recipientUserIds: newlyAssigned,
          actorId,
          type: 'task.assigned',
          title: `📋 Task Assigned: ${task.title}`,
          message: `You were assigned to "${task.title}".`,
          lines: [`You were assigned to the task "${task.title}".`],
          link: `/tasks/${task.id}`,
          actionLabel: 'View Task',
        });
      }
      if (unassigned.length > 0) {
        void this.notifications.dispatch({
          recipientUserIds: unassigned,
          actorId,
          type: 'task.unassigned',
          title: `📋 Task Unassigned: ${task.title}`,
          message: `You were removed from "${task.title}".`,
          lines: [`You are no longer assigned to the task "${task.title}".`],
          link: `/tasks/${task.id}`,
          actionLabel: 'View Task',
        });
      }
    }

    return this.serializeTask(task);
  }

  async move(id: string, input: MoveTaskDto, actorId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignees: { select: { userId: true } },
        project: {
          select: {
            id: true,
            name: true,
            seniors: { select: { userId: true } },
          },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found.');
    if (task.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime())
      throw new ConflictException('This task changed elsewhere. Reload the board and try again.');
    const column = await this.prisma.boardColumn.findUnique({ where: { id: input.columnId } });
    if (!column) throw new BadRequestException('Destination column not found.');
    if (input.beforeTaskId === id || input.afterTaskId === id)
      throw new BadRequestException('A task cannot be positioned relative to itself.');

    const updatedTask = await this.prisma.$transaction(async (transaction) => {
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

    if (task.columnId !== input.columnId) {
      const isReviewState = Boolean(
        column.isReview ||
          column.name.trim().toLowerCase() === 'review' ||
          column.name.trim().toLowerCase() === 'in review' ||
          column.name.trim().toLowerCase().includes('review'),
      );

      const projectSeniorIds = task.project?.seniors.map((s) => s.userId) ?? [];
      const recipientUserIds = Array.from(
        new Set([...task.assignees.map((a) => a.userId), task.createdById, ...projectSeniorIds]),
      );

      if (isReviewState) {
        void this.notifications.dispatch({
          recipientUserIds,
          actorId,
          type: 'task.review_requested',
          title: `🔍 Task In Review: ${task.title}`,
          message: `Task "${task.title}" has gone to review state.`,
          lines: [
            `Task "${task.title}" has gone to review state.`,
            task.project ? `Project: ${task.project.name}` : '',
            `Column: ${column.name}`,
          ].filter(Boolean),
          link: `/tasks/${task.id}`,
          actionLabel: 'Review Task',
          sendEmail: true,
          sendTelegram: true,
        });
      } else {
        void this.notifications.dispatch({
          recipientUserIds,
          actorId,
          type: 'task.status_changed',
          title: `🔄 Task Moved: ${task.title} → ${column.name}`,
          message: `"${task.title}" was moved to ${column.name}.`,
          lines: [`Task "${task.title}" was moved to column "${column.name}".`],
          link: `/tasks/${task.id}`,
          actionLabel: 'View Task',
          sendEmail: column.isDone,
          sendTelegram: column.isDone,
        });
      }
    }

    return updatedTask;
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
    await this.assertWorkspaceEstimate(input.estimate);
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
          ...(input.priority ? { priority: input.priority } : {}),
          ...estimateData(input.estimate),
        },
        include: { assignee: { select: userSummary }, attachments: { include: attachmentInclude } },
      });
      await this.event(transaction, 'subtask.created', 'subtask', created.id, actorId, { taskId });
      return created;
    });

    if (input.assigneeId) {
      const parentTask = await this.prisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, title: true },
      });
      void this.notifications.dispatch({
        recipientUserIds: [input.assigneeId],
        actorId,
        type: 'subtask.assigned',
        title: `📝 Subtask Assigned: ${subtask.title}`,
        message: `You were assigned to subtask "${subtask.title}".`,
        lines: [
          `You were assigned to subtask "${subtask.title}" on task "${parentTask?.title ?? 'Task'}".`,
          subtask.description ? `Description: ${subtask.description}` : '',
        ].filter(Boolean),
        link: `/tasks/${taskId}`,
        actionLabel: 'View Task',
      });
    }

    return this.serializeSubtask(subtask);
  }

  async updateSubtask(taskId: string, id: string, input: UpdateSubtaskDto, actorId: string) {
    const existing = await this.prisma.subtask.findFirst({ where: { id, taskId } });
    if (!existing) throw new NotFoundException('Subtask not found.');
    if (input.title !== undefined && !input.title.trim())
      throw new BadRequestException('Subtask title cannot be empty.');
    await this.assertWorkspaceEstimate(input.estimate);
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
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
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

    if (input.isCompleted === true && !existing.isCompleted) {
      const parentTask = await this.prisma.task.findUnique({
        where: { id: taskId },
        include: { assignees: { select: { userId: true } } },
      });
      if (parentTask) {
        const recipients = [...parentTask.assignees.map((a) => a.userId), parentTask.createdById];
        void this.notifications.dispatch({
          recipientUserIds: recipients,
          actorId,
          type: 'subtask.completed',
          title: `✅ Subtask Completed: ${subtask.title}`,
          message: `Subtask "${subtask.title}" was completed on "${parentTask.title}".`,
          lines: [`Subtask "${subtask.title}" was completed on "${parentTask.title}".`],
          link: `/tasks/${taskId}`,
          actionLabel: 'View Task',
        });
      }
    }

    if (input.assigneeId && input.assigneeId !== existing.assigneeId) {
      const parentTask = await this.prisma.task.findUnique({
        where: { id: taskId },
        select: { title: true },
      });
      void this.notifications.dispatch({
        recipientUserIds: [input.assigneeId],
        actorId,
        type: 'subtask.assigned',
        title: `📝 Subtask Assigned: ${subtask.title}`,
        message: `You were assigned to subtask "${subtask.title}".`,
        lines: [
          `You were assigned to subtask "${subtask.title}" on task "${parentTask?.title ?? 'Task'}".`,
        ],
        link: `/tasks/${taskId}`,
        actionLabel: 'View Task',
      });
    }

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
      return this.prisma.subtask
        .findUniqueOrThrow({
          where: { id },
          include: {
            assignee: { select: userSummary },
            attachments: { orderBy: { createdAt: 'asc' }, include: attachmentInclude },
          },
        })
        .then((item) => this.serializeSubtask(item));
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

  async commentOnTask(id: string, input: CommentDto, actorId: string) {
    await this.assertTask(id);
    return this.createComment({ taskId: id }, input, actorId, 'task', id);
  }

  async commentOnSubtask(taskId: string, id: string, input: CommentDto, actorId: string) {
    await this.assertSubtask(taskId, id);
    return this.createComment({ subtaskId: id }, input, actorId, 'subtask', id, { taskId });
  }

  async updateTaskComment(
    taskId: string,
    commentId: string,
    input: CommentDto,
    actor: AuthenticatedUser,
  ) {
    return this.updateComment({ taskId }, commentId, input, actor, 'task', taskId);
  }

  async updateSubtaskComment(
    taskId: string,
    subtaskId: string,
    commentId: string,
    input: CommentDto,
    actor: AuthenticatedUser,
  ) {
    await this.assertSubtask(taskId, subtaskId);
    return this.updateComment({ subtaskId }, commentId, input, actor, 'subtask', subtaskId, {
      taskId,
    });
  }

  async removeTaskComment(taskId: string, commentId: string, actor: AuthenticatedUser) {
    return this.removeComment({ taskId }, commentId, actor, 'task', taskId);
  }

  async removeSubtaskComment(
    taskId: string,
    subtaskId: string,
    commentId: string,
    actor: AuthenticatedUser,
  ) {
    await this.assertSubtask(taskId, subtaskId);
    return this.removeComment({ subtaskId }, commentId, actor, 'subtask', subtaskId, { taskId });
  }

  private async createComment(
    owner: { taskId?: string; subtaskId?: string },
    input: CommentDto,
    actorId: string,
    entityType: 'task' | 'subtask',
    entityId: string,
    details: object = {},
  ) {
    const body = input.body.trim();
    if (!body) throw new BadRequestException('Comment cannot be empty.');
    return this.prisma.$transaction(async (transaction) => {
      const comment = await transaction.workItemComment.create({
        data: { ...owner, authorId: actorId, body },
        include: { author: { select: userSummary } },
      });
      await this.event(
        transaction,
        `${entityType}.comment_created`,
        entityType,
        entityId,
        actorId,
        {
          commentId: comment.id,
          ...details,
        },
      );
      return comment;
    });
  }

  private async updateComment(
    owner: { taskId?: string; subtaskId?: string },
    commentId: string,
    input: CommentDto,
    actor: AuthenticatedUser,
    entityType: 'task' | 'subtask',
    entityId: string,
    details: object = {},
  ) {
    const body = input.body.trim();
    if (!body) throw new BadRequestException('Comment cannot be empty.');
    const comment = await this.prisma.workItemComment.findFirst({
      where: { id: commentId, ...owner },
    });
    if (!comment) throw new NotFoundException('Comment not found.');
    if (comment.authorId !== actor.id && actor.role !== UserRole.ADMIN)
      throw new ForbiddenException('You can only edit your own comments.');
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.workItemComment.update({
        where: { id: commentId },
        data: { body },
        include: { author: { select: userSummary } },
      });
      await this.event(
        transaction,
        `${entityType}.comment_updated`,
        entityType,
        entityId,
        actor.id,
        {
          commentId,
          ...details,
        },
      );
      return updated;
    });
  }

  private async removeComment(
    owner: { taskId?: string; subtaskId?: string },
    commentId: string,
    actor: AuthenticatedUser,
    entityType: 'task' | 'subtask',
    entityId: string,
    details: object = {},
  ) {
    const comment = await this.prisma.workItemComment.findFirst({
      where: { id: commentId, ...owner },
    });
    if (!comment) throw new NotFoundException('Comment not found.');
    if (comment.authorId !== actor.id && actor.role !== UserRole.ADMIN)
      throw new ForbiddenException('You can only delete your own comments.');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.workItemComment.delete({ where: { id: commentId } });
      await this.event(
        transaction,
        `${entityType}.comment_deleted`,
        entityType,
        entityId,
        actor.id,
        {
          commentId,
          ...details,
        },
      );
    });
  }

  private filters(query: TaskQueryDto): Prisma.TaskWhereInput {
    return {
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
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
      ...(query.priority ? { priority: query.priority } : {}),
    };
  }

  private async resolveCreateColumnId(
    workspaceId: string,
    requestedColumnId?: string,
    isSprintTask = false,
  ) {
    const columns = await this.prisma.boardColumn.findMany({
      where: { workspaceId },
      select: { id: true, isBacklog: true, isTodo: true, isDone: true, position: true },
      orderBy: { position: 'asc' },
    });
    const targetColumnId = isSprintTask ? pickTodoColumnId(columns) : pickBacklogColumnId(columns);
    if (!targetColumnId) throw new BadRequestException('No board columns are configured.');
    if (requestedColumnId && requestedColumnId !== targetColumnId) {
      throw new BadRequestException(
        isSprintTask
          ? 'New sprint tasks are placed in To Do.'
          : 'New tasks can only be created in the backlog.',
      );
    }
    return targetColumnId;
  }

  private async resolveTodoColumnId(workspaceId: string) {
    const columns = await this.prisma.boardColumn.findMany({
      where: { workspaceId },
      select: { id: true, isBacklog: true, isTodo: true, isDone: true, position: true },
      orderBy: { position: 'asc' },
    });
    const todoColumnId = pickTodoColumnId(columns);
    if (!todoColumnId) throw new BadRequestException('The To Do column is not configured.');
    return todoColumnId;
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

  private async assertSprintMembershipChange(
    currentSprintId: string | null,
    nextSprintId: string | null,
  ) {
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

  private async assertSubtask(taskId: string, id: string) {
    if (!(await this.prisma.subtask.findFirst({ where: { id, taskId }, select: { id: true } })))
      throw new NotFoundException('Subtask not found.');
  }

  private async assertWorkspaceEstimate(estimate?: EstimateDto | null, workspaceId?: string) {
    assertEstimate(estimate);
    if (!estimate) return;
    let mode: EstimateMode | undefined;
    if (workspaceId) {
      const ws = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { estimateMode: true },
      });
      if (ws) mode = ws.estimateMode;
    }
    if (!mode) {
      const settings = await this.prisma.appSettings.findUniqueOrThrow({
        where: { id: 'default' },
        select: { estimateMode: true },
      });
      mode = settings.estimateMode;
    }
    assertEstimateMatchesMode(estimate, mode);
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
