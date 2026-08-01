import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SprintStatus, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { CarryOverDto } from './dto/carry-over.dto';
import type { ResolveSprintWorkDto } from './dto/resolve-sprint-work.dto';
import type { AssignSprintTasksDto } from './dto/assign-sprint-tasks.dto';
import type { AssignSprintSubtasksDto } from './dto/assign-sprint-subtasks.dto';
import type { CommentDto } from './dto/comment.dto';
import type { CreateSprintDto } from './dto/create-sprint.dto';
import type { SprintQueryDto } from './dto/sprint-query.dto';
import type { StartSprintDto } from './dto/start-sprint.dto';
import type { UpdateSprintDto } from './dto/update-sprint.dto';
import {
  assertSubtaskCanJoinSprint,
  assertTaskCanJoinSprint,
  sprintAcceptsNewWork,
  sprintOutcomeTotals,
} from './sprint-work';
import { pickBacklogColumnId, pickTodoColumnId } from '../tasks/task-work';

const authorSelect = {
  id: true,
  displayName: true,
  hasAvatar: true,
  isActive: true,
};
const taskInclude = {
  column: { select: { id: true, name: true, isDone: true } },
  assignees: { include: { user: { select: authorSelect } }, orderBy: { assignedAt: 'asc' } },
  subtasks: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      title: true,
      isCompleted: true,
      estimateValue: true,
      estimateUnit: true,
      assignee: { select: authorSelect },
      sprint: { select: { id: true, name: true, status: true } },
    },
  },
} satisfies Prisma.TaskInclude;

@Injectable()
export class SprintsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SprintQueryDto) {
    const records = await this.prisma.sprint.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { _count: { select: { tasks: true, taskSnapshots: true, comments: true } } },
    });
    const hasMore = records.length > query.limit;
    const items = hasMore ? records.slice(0, query.limit) : records;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  async get(id: string) {
    const sprint = await this.prisma.sprint.findUnique({
      where: { id },
      include: {
        tasks: { orderBy: [{ position: 'asc' }, { id: 'asc' }], include: taskInclude },
        subtasks: {
          orderBy: [{ task: { title: 'asc' } }, { position: 'asc' }],
          include: {
            task: { select: { id: true, title: true, column: { select: { name: true } } } },
            assignee: { select: authorSelect },
          },
        },
        taskSnapshots: {
          orderBy: { title: 'asc' },
          include: { task: { select: { sprintId: true } } },
        },
        subtaskSnapshots: {
          orderBy: [{ taskTitle: 'asc' }, { title: 'asc' }],
          include: {
            subtask: {
              select: { sprintId: true, task: { select: { sprintId: true } } },
            },
          },
        },
        comments: {
          take: 50,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { author: { select: authorSelect } },
        },
      },
    });
    if (!sprint) throw new NotFoundException('Sprint not found.');
    const outcomes = this.outcomes(
      sprint.status === SprintStatus.COMPLETED ? sprint.taskSnapshots : sprint.tasks,
    );
    return {
      ...sprint,
      taskSnapshots: sprint.taskSnapshots.map(({ task, ...snapshot }) => ({
        ...snapshot,
        canCarryOver: !snapshot.wasDone && snapshot.taskId !== null && task?.sprintId === id,
      })),
      subtaskSnapshots: sprint.subtaskSnapshots.map(({ subtask, ...snapshot }) => ({
        ...snapshot,
        canCarryOver:
          !snapshot.wasDone &&
          snapshot.subtaskId !== null &&
          (subtask?.sprintId === id ||
            (subtask?.sprintId === null && subtask.task.sprintId === id)),
      })),
      outcomes,
    };
  }

  async availableTasks(id: string) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id }, select: { status: true } });
    if (!sprint) throw new NotFoundException('Sprint not found.');
    this.assertSprintAcceptsWork(sprint.status);
    return this.prisma.task.findMany({
      where: {
        OR: [
          { sprintId: null },
          { sprintId: { not: id }, sprint: { is: { status: SprintStatus.PLANNED } } },
          {
            subtasks: {
              some: {
                OR: [
                  { sprintId: null },
                  { sprintId: { not: id }, sprint: { is: { status: SprintStatus.PLANNED } } },
                ],
              },
            },
          },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      include: { ...taskInclude, sprint: { select: { id: true, name: true, status: true } } },
    });
  }

  async availableSubtasks(id: string) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id }, select: { status: true } });
    if (!sprint) throw new NotFoundException('Sprint not found.');
    this.assertSprintAcceptsWork(sprint.status);
    return this.prisma.subtask.findMany({
      where: {
        OR: [
          { sprintId: null },
          { sprintId: { not: id }, sprint: { is: { status: SprintStatus.PLANNED } } },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      include: {
        task: { select: { id: true, title: true, sprintId: true } },
        assignee: { select: authorSelect },
        sprint: { select: { id: true, name: true } },
      },
    });
  }

  async assignTasks(id: string, input: AssignSprintTasksDto, actorId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const target = await transaction.sprint.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!target) throw new NotFoundException('Sprint not found.');
      this.assertSprintAcceptsWork(target.status);
      const tasks = await transaction.task.findMany({
        where: { id: { in: input.taskIds } },
        select: {
          id: true,
          columnId: true,
          sprintId: true,
          sprint: { select: { id: true, status: true } },
        },
      });
      if (tasks.length !== input.taskIds.length)
        throw new BadRequestException('One or more selected tasks no longer exist.');
      for (const task of tasks) {
        try {
          assertTaskCanJoinSprint(task.sprint, id);
        } catch (caught) {
          throw new BadRequestException(
            caught instanceof Error ? caught.message : 'Task cannot join this sprint.',
          );
        }
      }
      const columns = await transaction.boardColumn.findMany({
        select: { id: true, isBacklog: true, isTodo: true, isDone: true, position: true },
        orderBy: { position: 'asc' },
      });
      const todoColumnId = pickTodoColumnId(columns);
      if (!todoColumnId) throw new BadRequestException('The To Do column is not configured.');
      const maximum = await transaction.task.aggregate({
        where: { columnId: todoColumnId },
        _max: { position: true },
      });
      let position = Number(maximum._max.position ?? 0);
      for (const task of tasks) {
        position += 1024;
        await transaction.subtask.updateMany({
          where: { taskId: task.id, columnId: task.columnId },
          data: { columnId: todoColumnId },
        });
        await transaction.task.update({
          where: { id: task.id },
          data: { sprintId: id, columnId: todoColumnId, position },
        });
      }
      await this.event(transaction, 'sprint.tasks_assigned', id, actorId, {
        taskIds: input.taskIds,
      });
      return { assigned: input.taskIds.length };
    });
  }

  async assignSubtasks(id: string, input: AssignSprintSubtasksDto, actorId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const target = await transaction.sprint.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!target) throw new NotFoundException('Sprint not found.');
      this.assertSprintAcceptsWork(target.status);
      const subtasks = await transaction.subtask.findMany({
        where: { id: { in: input.subtaskIds } },
        select: { id: true, sprintId: true, sprint: { select: { id: true, status: true } } },
      });
      if (subtasks.length !== input.subtaskIds.length)
        throw new BadRequestException('One or more selected subtasks no longer exist.');
      for (const subtask of subtasks) {
        try {
          assertSubtaskCanJoinSprint(subtask.sprint, id);
        } catch (caught) {
          throw new BadRequestException(
            caught instanceof Error ? caught.message : 'Subtask cannot join this sprint.',
          );
        }
      }
      await transaction.subtask.updateMany({
        where: { id: { in: input.subtaskIds } },
        data: { sprintId: id },
      });
      await this.event(transaction, 'sprint.subtasks_assigned', id, actorId, {
        subtaskIds: input.subtaskIds,
      });
      return { assigned: input.subtaskIds.length };
    });
  }

  async create(input: CreateSprintDto, actorId: string) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Sprint name cannot be empty.');
    return this.prisma.$transaction(async (transaction) => {
      const sprint = await transaction.sprint.create({
        data: { name, goal: input.goal?.trim() || null },
        include: { _count: { select: { tasks: true, taskSnapshots: true, comments: true } } },
      });
      await this.event(transaction, 'sprint.created', sprint.id, actorId, { name });
      return sprint;
    });
  }

  async update(id: string, input: UpdateSprintDto, actor: AuthenticatedUser) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id } });
    if (!sprint) throw new NotFoundException('Sprint not found.');
    if (sprint.status === SprintStatus.COMPLETED && actor.role !== UserRole.ADMIN)
      throw new ForbiddenException('Only administrators can correct a completed sprint.');
    if (input.name !== undefined && !input.name.trim())
      throw new BadRequestException('Sprint name cannot be empty.');
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.sprint.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.goal !== undefined ? { goal: input.goal?.trim() || null } : {}),
        },
      });
      await this.event(transaction, 'sprint.updated', id, actor.id, { fields: Object.keys(input) });
      return updated;
    });
  }

  async start(id: string, input: StartSprintDto, actorId: string) {
    const startsAt = input.startsAt ? this.date(input.startsAt, 'start date') : new Date();
    return this.prisma.$transaction(async (transaction) => {
      const sprint = await transaction.sprint.findUnique({ where: { id } });
      if (!sprint) throw new NotFoundException('Sprint not found.');
      if (sprint.status !== SprintStatus.PLANNED)
        throw new ConflictException('Only planned sprints can be started.');
      const settings = await transaction.appSettings.findUniqueOrThrow({
        where: { id: 'default' },
      });
      const endsAt = input.endsAt
        ? this.date(input.endsAt, 'end date')
        : new Date(startsAt.getTime() + settings.sprintDurationDays * 86_400_000);
      if (endsAt <= startsAt)
        throw new BadRequestException('The sprint end date must be after start.');
      const active = await transaction.sprint.findFirst({
        where: { status: SprintStatus.ACTIVE },
        select: { id: true },
      });
      if (active) throw new ConflictException('Finish the active sprint before starting another.');
      const updated = await transaction.sprint.update({
        where: { id },
        data: { status: SprintStatus.ACTIVE, startsAt, endsAt },
      });
      await this.event(transaction, 'sprint.started', id, actorId, { startsAt, endsAt });
      return updated;
    });
  }

  async finish(id: string, actorId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const sprint = await transaction.sprint.findUnique({
        where: { id },
        include: {
          tasks: {
            include: {
              column: { select: { name: true, isDone: true } },
              subtasks: true,
            },
          },
          subtasks: { include: { task: { select: { title: true } } } },
        },
      });
      if (!sprint) throw new NotFoundException('Sprint not found.');
      if (sprint.status !== SprintStatus.ACTIVE)
        throw new ConflictException('Only active sprints can be finished.');
      const completedAt = new Date();
      if (sprint.tasks.length) {
        await transaction.sprintTaskSnapshot.createMany({
          data: sprint.tasks.map((task) => ({
            sprintId: id,
            taskId: task.id,
            title: task.title,
            estimateValue: task.estimateValue,
            estimateUnit: task.estimateUnit,
            columnName: task.column.name,
            wasDone: task.column.isDone,
            completedAt,
          })),
        });
      }
      const subtasks = new Map<
        string,
        {
          id: string;
          taskId: string;
          taskTitle: string;
          title: string;
          estimateValue: number | null;
          estimateUnit: 'HOURS' | 'POINTS' | null;
          isCompleted: boolean;
        }
      >();
      for (const task of sprint.tasks) {
        for (const subtask of task.subtasks) {
          subtasks.set(subtask.id, { ...subtask, taskTitle: task.title });
        }
      }
      for (const subtask of sprint.subtasks) {
        subtasks.set(subtask.id, { ...subtask, taskTitle: subtask.task.title });
      }
      if (subtasks.size) {
        await transaction.sprintSubtaskSnapshot.createMany({
          data: Array.from(subtasks.values()).map((subtask) => ({
            sprintId: id,
            subtaskId: subtask.id,
            taskId: subtask.taskId,
            taskTitle: subtask.taskTitle,
            title: subtask.title,
            estimateValue: subtask.estimateValue,
            estimateUnit: subtask.estimateUnit,
            wasDone: subtask.isCompleted,
            completedAt,
          })),
        });
      }
      const unfinishedTaskIds = sprint.tasks
        .filter((task) => !task.column.isDone)
        .map((task) => task.id);
      const unfinishedSubtasks = Array.from(subtasks.values()).filter(
        (subtask) => !subtask.isCompleted,
      );
      const unfinishedSubtaskIds = unfinishedSubtasks.map((subtask) => subtask.id);
      const standaloneSubtaskIds = unfinishedSubtasks
        .filter((subtask) => !unfinishedTaskIds.includes(subtask.taskId))
        .map((subtask) => subtask.id);

      if (unfinishedTaskIds.length || standaloneSubtaskIds.length) {
        const columns = await transaction.boardColumn.findMany({
          select: { id: true, isBacklog: true, position: true },
          orderBy: { position: 'asc' },
        });
        const backlogColumnId = pickBacklogColumnId(columns);
        if (!backlogColumnId)
          throw new BadRequestException('The backlog column is not configured.');

        const maximum = await transaction.task.aggregate({
          where: { columnId: backlogColumnId },
          _max: { position: true },
        });
        let position = Number(maximum._max.position ?? 0);
        for (const taskId of unfinishedTaskIds) {
          position += 1024;
          await transaction.subtask.updateMany({
            where: { taskId, isCompleted: false },
            data: { sprintId: null, columnId: backlogColumnId },
          });
          await transaction.task.update({
            where: { id: taskId },
            data: { sprintId: null, columnId: backlogColumnId, position },
          });
        }
        if (standaloneSubtaskIds.length) {
          await transaction.subtask.updateMany({
            where: { id: { in: standaloneSubtaskIds } },
            data: { sprintId: null, columnId: backlogColumnId },
          });
          await transaction.sprintSubtaskSnapshot.updateMany({
            where: { sprintId: id, subtaskId: { in: standaloneSubtaskIds } },
            data: { subtaskId: null },
          });
        }
      }
      const updated = await transaction.sprint.update({
        where: { id },
        data: { status: SprintStatus.COMPLETED, completedAt },
      });
      await this.event(transaction, 'sprint.finished', id, actorId, {
        completedAt,
        totalTasks: sprint.tasks.length,
        completedTasks: sprint.tasks.filter((task) => task.column.isDone).length,
        totalSubtasks: subtasks.size,
        completedSubtasks: subtasks.size - unfinishedSubtaskIds.length,
      });
      return updated;
    });
  }

  async carryOver(id: string, input: CarryOverDto, actorId: string) {
    const taskIds = input.taskIds ?? [];
    const subtaskIds = input.subtaskIds ?? [];
    this.assertWorkSelected(taskIds, subtaskIds);
    if (id === input.targetSprintId)
      throw new BadRequestException('Choose a different planned sprint for carry-over.');
    return this.prisma.$transaction(async (transaction) => {
      const [source, target] = await Promise.all([
        transaction.sprint.findUnique({ where: { id }, select: { status: true } }),
        transaction.sprint.findUnique({
          where: { id: input.targetSprintId },
          select: { status: true },
        }),
      ]);
      if (!source) throw new NotFoundException('Source sprint not found.');
      if (!target) throw new BadRequestException('Target sprint not found.');
      if (source.status !== SprintStatus.COMPLETED)
        throw new ConflictException('Carry-over is available after a sprint is completed.');
      if (target.status !== SprintStatus.PLANNED)
        throw new BadRequestException('Carry-over target must be a planned sprint.');
      const [taskSnapshots, subtaskSnapshots] = await Promise.all([
        transaction.sprintTaskSnapshot.findMany({
          where: { sprintId: id, taskId: { in: taskIds }, wasDone: false },
          select: { taskId: true },
        }),
        transaction.sprintSubtaskSnapshot.findMany({
          where: { sprintId: id, subtaskId: { in: subtaskIds }, wasDone: false },
          select: { subtaskId: true },
        }),
      ]);
      if (taskSnapshots.length !== taskIds.length || subtaskSnapshots.length !== subtaskIds.length)
        throw new BadRequestException('Select unfinished work from this sprint only.');
      const [tasks, subtasks] = await Promise.all([
        transaction.task.findMany({
          where: { id: { in: taskIds }, sprintId: id },
          select: { id: true, columnId: true },
        }),
        transaction.subtask.findMany({
          where: {
            id: { in: subtaskIds },
            isCompleted: false,
            OR: [{ sprintId: id }, { sprintId: null, task: { is: { sprintId: id } } }],
          },
          select: { id: true, taskId: true, columnId: true },
        }),
      ]);
      if (tasks.length !== taskIds.length || subtasks.length !== subtaskIds.length)
        throw new ConflictException(
          'One or more selected items have already been moved or removed.',
        );
      const selectedTaskIds = new Set(tasks.map((task) => task.id));
      const standaloneSubtaskIds = subtasks
        .filter((subtask) => !selectedTaskIds.has(subtask.taskId))
        .map((subtask) => subtask.id);
      const columns = await transaction.boardColumn.findMany({
        select: { id: true, isBacklog: true, isTodo: true, isDone: true, position: true },
        orderBy: { position: 'asc' },
      });
      const todoColumnId = pickTodoColumnId(columns);
      if (!todoColumnId) throw new BadRequestException('The To Do column is not configured.');
      const maximum = await transaction.task.aggregate({
        where: { columnId: todoColumnId },
        _max: { position: true },
      });
      let position = Number(maximum._max.position ?? 0);
      for (const task of tasks) {
        position += 1024;
        await transaction.subtask.updateMany({
          where: { taskId: task.id, columnId: task.columnId },
          data: { columnId: todoColumnId },
        });
        await transaction.task.update({
          where: { id: task.id },
          data: { sprintId: input.targetSprintId, columnId: todoColumnId, position },
        });
      }
      if (standaloneSubtaskIds.length) {
        await transaction.subtask.updateMany({
          where: { id: { in: standaloneSubtaskIds } },
          data: { sprintId: input.targetSprintId, columnId: todoColumnId },
        });
      }
      await this.event(transaction, 'sprint.work_carried_over', id, actorId, {
        taskIds,
        subtaskIds: standaloneSubtaskIds,
        targetSprintId: input.targetSprintId,
      });
      return {
        moved: tasks.length + standaloneSubtaskIds.length,
        movedTasks: tasks.length,
        movedSubtasks: standaloneSubtaskIds.length,
        targetSprintId: input.targetSprintId,
      };
    });
  }

  async moveToBacklog(id: string, input: ResolveSprintWorkDto, actorId: string) {
    const taskIds = input.taskIds ?? [];
    const subtaskIds = input.subtaskIds ?? [];
    this.assertWorkSelected(taskIds, subtaskIds);
    return this.prisma.$transaction(async (transaction) => {
      const source = await transaction.sprint.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!source) throw new NotFoundException('Source sprint not found.');
      if (source.status !== SprintStatus.COMPLETED)
        throw new ConflictException(
          'Moving work to the backlog is available after a sprint is completed.',
        );

      const [taskSnapshots, subtaskSnapshots] = await Promise.all([
        transaction.sprintTaskSnapshot.findMany({
          where: { sprintId: id, taskId: { in: taskIds }, wasDone: false },
          select: { taskId: true },
        }),
        transaction.sprintSubtaskSnapshot.findMany({
          where: { sprintId: id, subtaskId: { in: subtaskIds }, wasDone: false },
          select: { subtaskId: true },
        }),
      ]);
      if (taskSnapshots.length !== taskIds.length || subtaskSnapshots.length !== subtaskIds.length)
        throw new BadRequestException('Select unfinished work from this sprint only.');

      const [tasks, subtasks] = await Promise.all([
        transaction.task.findMany({
          where: { id: { in: taskIds }, sprintId: id },
          select: { id: true, columnId: true },
        }),
        transaction.subtask.findMany({
          where: {
            id: { in: subtaskIds },
            isCompleted: false,
            OR: [{ sprintId: id }, { sprintId: null, task: { is: { sprintId: id } } }],
          },
          select: { id: true, taskId: true, columnId: true },
        }),
      ]);
      if (tasks.length !== taskIds.length || subtasks.length !== subtaskIds.length)
        throw new ConflictException(
          'One or more selected items have already been moved or removed.',
        );

      const selectedTaskIds = new Set(tasks.map((task) => task.id));
      const standaloneSubtaskIds = subtasks
        .filter((subtask) => !selectedTaskIds.has(subtask.taskId))
        .map((subtask) => subtask.id);
      const columns = await transaction.boardColumn.findMany({
        select: { id: true, isBacklog: true, position: true },
        orderBy: { position: 'asc' },
      });
      const backlogColumnId = pickBacklogColumnId(columns);
      if (!backlogColumnId) throw new BadRequestException('The backlog column is not configured.');

      const maximum = await transaction.task.aggregate({
        where: { columnId: backlogColumnId },
        _max: { position: true },
      });
      let position = Number(maximum._max.position ?? 0);
      for (const task of tasks) {
        position += 1024;
        await transaction.subtask.updateMany({
          where: { taskId: task.id, columnId: task.columnId },
          data: { columnId: backlogColumnId },
        });
        await transaction.task.update({
          where: { id: task.id },
          data: { sprintId: null, columnId: backlogColumnId, position },
        });
      }
      if (standaloneSubtaskIds.length) {
        await transaction.subtask.updateMany({
          where: { id: { in: standaloneSubtaskIds } },
          data: { sprintId: null, columnId: backlogColumnId },
        });
        // A standalone subtask that returns to the backlog still has its parent task
        // in this completed sprint. Clearing this live reference marks it as resolved
        // without changing the historical snapshot itself.
        await transaction.sprintSubtaskSnapshot.updateMany({
          where: { sprintId: id, subtaskId: { in: standaloneSubtaskIds } },
          data: { subtaskId: null },
        });
      }
      await this.event(transaction, 'sprint.work_moved_to_backlog', id, actorId, {
        taskIds,
        subtaskIds: standaloneSubtaskIds,
      });
      return {
        moved: tasks.length + standaloneSubtaskIds.length,
        movedTasks: tasks.length,
        movedSubtasks: standaloneSubtaskIds.length,
      };
    });
  }

  async comments(id: string, query: SprintQueryDto) {
    await this.ensureSprint(id);
    const records = await this.prisma.sprintComment.findMany({
      where: { sprintId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { author: { select: authorSelect } },
    });
    const hasMore = records.length > query.limit;
    const items = hasMore ? records.slice(0, query.limit) : records;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  async comment(id: string, input: CommentDto, actorId: string) {
    const body = input.body.trim();
    if (!body) throw new BadRequestException('Comment cannot be empty.');
    await this.ensureSprint(id);
    return this.prisma.$transaction(async (transaction) => {
      const comment = await transaction.sprintComment.create({
        data: { sprintId: id, authorId: actorId, body },
        include: { author: { select: authorSelect } },
      });
      await this.event(transaction, 'sprint.comment_created', id, actorId, {
        commentId: comment.id,
      });
      return comment;
    });
  }

  async updateComment(id: string, commentId: string, input: CommentDto, actor: AuthenticatedUser) {
    const body = input.body.trim();
    if (!body) throw new BadRequestException('Comment cannot be empty.');
    const comment = await this.prisma.sprintComment.findFirst({
      where: { id: commentId, sprintId: id },
    });
    if (!comment) throw new NotFoundException('Sprint comment not found.');
    if (comment.authorId !== actor.id && actor.role !== UserRole.ADMIN)
      throw new ForbiddenException('You can only edit your own comments.');
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.sprintComment.update({
        where: { id: commentId },
        data: { body },
        include: { author: { select: authorSelect } },
      });
      await this.event(transaction, 'sprint.comment_updated', id, actor.id, { commentId });
      return updated;
    });
  }

  async removeComment(id: string, commentId: string, actor: AuthenticatedUser) {
    const comment = await this.prisma.sprintComment.findFirst({
      where: { id: commentId, sprintId: id },
    });
    if (!comment) throw new NotFoundException('Sprint comment not found.');
    if (comment.authorId !== actor.id && actor.role !== UserRole.ADMIN)
      throw new ForbiddenException('You can only delete your own comments.');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.sprintComment.delete({ where: { id: commentId } });
      await this.event(transaction, 'sprint.comment_deleted', id, actor.id, { commentId });
    });
  }

  private assertSprintAcceptsWork(status: SprintStatus) {
    if (!sprintAcceptsNewWork(status))
      throw new ConflictException('Completed sprints cannot accept new work.');
  }

  private assertWorkSelected(taskIds: string[], subtaskIds: string[]) {
    if (!taskIds.length && !subtaskIds.length)
      throw new BadRequestException('Select at least one unfinished task or subtask.');
  }

  private outcomes(
    items: Array<{
      estimateValue: number | null;
      estimateUnit: string | null;
      wasDone?: boolean;
      column?: { isDone: boolean };
    }>,
  ) {
    return sprintOutcomeTotals(items);
  }

  private async ensureSprint(id: string) {
    if (!(await this.prisma.sprint.findUnique({ where: { id }, select: { id: true } })))
      throw new NotFoundException('Sprint not found.');
  }

  private date(value: string, label: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`Invalid ${label}.`);
    return date;
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
        entityType: 'sprint',
        entityId,
        actorId,
        payload: { version: 1, ...details },
      },
    });
  }
}
