import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstimateUnit,
  Prisma,
  SprintStatus,
  TaskPriority,
  TaskType,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { CarryOverDto } from './dto/carry-over.dto';
import type { ResolveSprintWorkDto } from './dto/resolve-sprint-work.dto';
import type { AssignSprintTasksDto } from './dto/assign-sprint-tasks.dto';
import type { AssignSprintSubtasksDto } from './dto/assign-sprint-subtasks.dto';
import type { CommentDto } from './dto/comment.dto';
import type { CreateSprintDto } from './dto/create-sprint.dto';
import type { FinishSprintDto } from './dto/finish-sprint.dto';
import type { SprintQueryDto } from './dto/sprint-query.dto';
import type { StartSprintDto } from './dto/start-sprint.dto';
import type { UpdateSprintDto } from './dto/update-sprint.dto';
import {
  assertSubtaskCanJoinSprint,
  assertTaskCanJoinSprint,
  sprintAcceptsNewWork,
  sprintOutcomeTotals,
} from './sprint-work';

export function generateNextSprintName(currentName: string, existingNames: string[]): string {
  const nameLowerSet = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const trimmed = currentName.trim();
  const match = trimmed.match(/^(.*?)(\d+)$/);
  let prefix = '';
  let startNum = 2;
  if (match) {
    prefix = match[1];
    startNum = parseInt(match[2], 10) + 1;
  } else {
    prefix = `${trimmed} `;
    startNum = 2;
  }
  let candidate = `${prefix}${startNum}`.trim();
  while (nameLowerSet.has(candidate.toLowerCase())) {
    startNum++;
    candidate = `${prefix}${startNum}`.trim();
  }
  return candidate;
}
import { pickBacklogColumnId, pickTodoColumnId } from '../tasks/task-work';

import { NotificationsService } from '../notifications/notifications.service';
import { BoardEventsService } from '../board/board-events.service';

const authorSelect = {
  id: true,
  displayName: true,
  color: true,
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
      priority: true,
      estimateValue: true,
      estimateUnit: true,
      assignee: { select: authorSelect },
      sprint: { select: { id: true, name: true, status: true } },
    },
  },
} satisfies Prisma.TaskInclude;

@Injectable()
export class SprintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
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

  async list(query: SprintQueryDto) {
    const where: Prisma.SprintWhereInput = {
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const records = await this.prisma.sprint.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { _count: { select: { tasks: true, taskSnapshots: true, comments: true } } },
    });
    const hasMore = records.length > query.limit;
    const items = hasMore ? records.slice(0, query.limit) : records;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  async history(workspaceId?: string) {
    const wsId = await this.resolveWorkspaceId(workspaceId);
    const sprints = await this.prisma.sprint.findMany({
      where: {
        workspaceId: wsId,
        status: SprintStatus.COMPLETED,
      },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      include: {
        taskSnapshots: {
          orderBy: [{ completedAt: 'desc' }, { title: 'asc' }],
          include: {
            task: {
              select: {
                id: true,
                type: true,
                priority: true,
                sprintId: true,
                assignees: {
                  include: { user: { select: authorSelect } },
                  orderBy: { assignedAt: 'asc' },
                },
              },
            },
          },
        },
        subtaskSnapshots: {
          orderBy: [{ taskTitle: 'asc' }, { title: 'asc' }],
          include: {
            subtask: {
              select: {
                id: true,
                priority: true,
                assignee: { select: authorSelect },
              },
            },
          },
        },
        tasks: {
          where: {
            column: { isDone: true },
          },
          include: taskInclude,
        },
        _count: {
          select: { tasks: true, taskSnapshots: true, comments: true },
        },
      },
    });

    return sprints.map((sprint) => {
      const hasSnapshots = sprint.taskSnapshots.length > 0;

      const subtasksByTaskId = new Map<string, typeof sprint.subtaskSnapshots>();
      const standaloneSubtasks: typeof sprint.subtaskSnapshots = [];
      const taskSnapshotIds = new Set(
        sprint.taskSnapshots.map((ts) => ts.taskId).filter(Boolean) as string[],
      );

      for (const subSnap of sprint.subtaskSnapshots) {
        if (subSnap.wasDone) {
          if (subSnap.taskId && taskSnapshotIds.has(subSnap.taskId)) {
            const list = subtasksByTaskId.get(subSnap.taskId) ?? [];
            list.push(subSnap);
            subtasksByTaskId.set(subSnap.taskId, list);
          } else {
            standaloneSubtasks.push(subSnap);
          }
        }
      }

      let doneTasks: Array<{
        id: string;
        taskId: string | null;
        title: string;
        type: TaskType;
        priority: TaskPriority;
        estimateValue: number | null;
        estimateUnit: EstimateUnit | null;
        columnName: string;
        completedAt: Date;
        assignees: Array<{
          id: string;
          displayName: string;
          color: string;
          hasAvatar: boolean;
          isActive: boolean;
        }>;
        subtasks: Array<{
          id: string;
          subtaskId: string | null;
          title: string;
          estimateValue: number | null;
          estimateUnit: EstimateUnit | null;
          completedAt: Date;
          assignee: {
            id: string;
            displayName: string;
            color: string;
            hasAvatar: boolean;
            isActive: boolean;
          } | null;
        }>;
      }> = [];

      if (hasSnapshots) {
        const doneSnapshots = sprint.taskSnapshots.filter((ts) => ts.wasDone);
        doneTasks = doneSnapshots.map((ts) => {
          const subtaskSnaps = ts.taskId ? (subtasksByTaskId.get(ts.taskId) ?? []) : [];
          return {
            id: ts.id,
            taskId: ts.taskId,
            title: ts.title,
            type: ts.task?.type ?? 'TASK',
            priority: ts.task?.priority ?? 'MEDIUM',
            estimateValue: ts.estimateValue,
            estimateUnit: ts.estimateUnit,
            columnName: ts.columnName,
            completedAt: ts.completedAt,
            assignees: (ts.task?.assignees.map((a) => a.user) ?? []) as Array<{
              id: string;
              displayName: string;
              color: string;
              hasAvatar: boolean;
              isActive: boolean;
            }>,
            subtasks: subtaskSnaps.map((sub) => ({
              id: sub.id,
              subtaskId: sub.subtaskId,
              title: sub.title,
              estimateValue: sub.estimateValue,
              estimateUnit: sub.estimateUnit,
              completedAt: sub.completedAt,
              assignee: sub.subtask?.assignee ?? null,
            })),
          };
        });
      } else {
        doneTasks = sprint.tasks.map((task) => ({
          id: task.id,
          taskId: task.id,
          title: task.title,
          type: task.type,
          priority: task.priority,
          estimateValue: task.estimateValue,
          estimateUnit: task.estimateUnit,
          columnName: task.column.name,
          completedAt: sprint.completedAt ?? task.updatedAt,
          assignees: task.assignees.map((a) => a.user),
          subtasks: task.subtasks
            .filter((sub) => sub.isCompleted)
            .map((sub) => ({
              id: sub.id,
              subtaskId: sub.id,
              title: sub.title,
              estimateValue: sub.estimateValue,
              estimateUnit: sub.estimateUnit,
              completedAt: sprint.completedAt ?? task.updatedAt,
              assignee: sub.assignee,
            })),
        }));
      }

      let estimateHours = 0;
      let estimatePoints = 0;
      for (const t of doneTasks) {
        if (t.estimateUnit === 'HOURS' && t.estimateValue) {
          estimateHours += t.estimateValue;
        } else if (t.estimateUnit === 'POINTS' && t.estimateValue) {
          estimatePoints += t.estimateValue;
        }
      }

      const totalTasksCount = hasSnapshots ? sprint.taskSnapshots.length : sprint.tasks.length;
      const completedTasksCount = doneTasks.length;

      return {
        id: sprint.id,
        name: sprint.name,
        goal: sprint.goal,
        status: sprint.status,
        startsAt: sprint.startsAt,
        endsAt: sprint.endsAt,
        completedAt: sprint.completedAt,
        createdAt: sprint.createdAt,
        totalTasks: totalTasksCount,
        completedTasks: completedTasksCount,
        totalSubtasks: sprint.subtaskSnapshots.length,
        completedSubtasks: sprint.subtaskSnapshots.filter((s) => s.wasDone).length,
        estimateTotals: {
          hours: Math.round(estimateHours * 100) / 100,
          points: Math.round(estimatePoints * 100) / 100,
        },
        doneTasks,
        standaloneDoneSubtasks: standaloneSubtasks.map((sub) => ({
          id: sub.id,
          subtaskId: sub.subtaskId,
          taskId: sub.taskId,
          taskTitle: sub.taskTitle,
          title: sub.title,
          estimateValue: sub.estimateValue,
          estimateUnit: sub.estimateUnit,
          completedAt: sub.completedAt,
          assignee: sub.subtask?.assignee ?? null,
        })),
      };
    });
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
    const sprint = await this.prisma.sprint.findUnique({
      where: { id },
      select: { status: true, workspaceId: true },
    });
    if (!sprint) throw new NotFoundException('Sprint not found.');
    this.assertSprintAcceptsWork(sprint.status);
    return this.prisma.task.findMany({
      where: {
        workspaceId: sprint.workspaceId,
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
    const sprint = await this.prisma.sprint.findUnique({
      where: { id },
      select: { status: true, workspaceId: true },
    });
    if (!sprint) throw new NotFoundException('Sprint not found.');
    this.assertSprintAcceptsWork(sprint.status);
    return this.prisma.subtask.findMany({
      where: {
        task: { workspaceId: sprint.workspaceId },
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
    const result = await this.prisma.$transaction(async (transaction) => {
      const target = await transaction.sprint.findUnique({
        where: { id },
        select: { status: true, workspaceId: true },
      });
      if (!target) throw new NotFoundException('Sprint not found.');
      this.assertSprintAcceptsWork(target.status);
      const tasks = await transaction.task.findMany({
        where: { id: { in: input.taskIds }, workspaceId: target.workspaceId },
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
        where: { workspaceId: target.workspaceId },
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
      return { assigned: input.taskIds.length, workspaceId: target.workspaceId };
    });
    this.events?.emitBoardUpdate(result.workspaceId, 'sprint.tasks_assigned', id, actorId, {
      taskIds: input.taskIds,
    });
    return { assigned: result.assigned };
  }

  async assignSubtasks(id: string, input: AssignSprintSubtasksDto, actorId: string) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const target = await transaction.sprint.findUnique({
        where: { id },
        select: { status: true, workspaceId: true },
      });
      if (!target) throw new NotFoundException('Sprint not found.');
      this.assertSprintAcceptsWork(target.status);
      const subtasks = await transaction.subtask.findMany({
        where: { id: { in: input.subtaskIds }, task: { workspaceId: target.workspaceId } },
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
      const columns = await transaction.boardColumn.findMany({
        where: { workspaceId: target.workspaceId },
        select: { id: true, isBacklog: true, isTodo: true, isDone: true, position: true },
        orderBy: { position: 'asc' },
      });
      const todoColumnId = pickTodoColumnId(columns);
      if (!todoColumnId) throw new BadRequestException('The To Do column is not configured.');
      await transaction.subtask.updateMany({
        where: { id: { in: input.subtaskIds } },
        data: { sprintId: id, columnId: todoColumnId },
      });
      await this.event(transaction, 'sprint.subtasks_assigned', id, actorId, {
        subtaskIds: input.subtaskIds,
      });
      return { assigned: input.subtaskIds.length, workspaceId: target.workspaceId };
    });
    this.events?.emitBoardUpdate(result.workspaceId, 'sprint.subtasks_assigned', id, actorId, {
      subtaskIds: input.subtaskIds,
    });
    return { assigned: result.assigned };
  }

  async create(input: CreateSprintDto, actorId: string) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Sprint name cannot be empty.');
    const workspaceId = await this.resolveWorkspaceId(input.workspaceId);
    return this.prisma.$transaction(async (transaction) => {
      const sprint = await transaction.sprint.create({
        data: { workspaceId, name, goal: input.goal?.trim() || null },
        include: { _count: { select: { tasks: true, taskSnapshots: true, comments: true } } },
      });
      await this.event(transaction, 'sprint.created', sprint.id, actorId, { name, workspaceId });
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

  async start(id: string, _input: StartSprintDto, actorId: string) {
    const startsAt = new Date();
    const result = await this.prisma.$transaction(async (transaction) => {
      const sprint = await transaction.sprint.findUnique({ where: { id } });
      if (!sprint) throw new NotFoundException('Sprint not found.');
      if (sprint.status !== SprintStatus.PLANNED)
        throw new ConflictException('Only planned sprints can be started.');
      const active = await transaction.sprint.findFirst({
        where: { workspaceId: sprint.workspaceId, status: SprintStatus.ACTIVE },
        select: { id: true, name: true },
      });
      if (active)
        throw new ConflictException(
          `Cannot start sprint: Sprint "${active.name}" is currently active. Finish it before starting another sprint.`,
        );
      const updated = await transaction.sprint.update({
        where: { id },
        data: { status: SprintStatus.ACTIVE, startsAt, endsAt: null },
      });
      await this.event(transaction, 'sprint.started', id, actorId, {
        startsAt,
        workspaceId: sprint.workspaceId,
      });
      return {
        updated,
        workspaceId: sprint.workspaceId,
        sprintName: sprint.name,
        goal: sprint.goal,
        startsAt,
      };
    });

    this.events?.emitBoardUpdate(result.workspaceId, 'sprint.started', id, actorId);

    void (async () => {
      try {
        const activeUsers = await this.prisma.user.findMany({
          where: { isActive: true },
          select: { id: true },
        });
        await this.notifications.dispatch({
          recipientUserIds: activeUsers.map((u) => u.id),
          actorId,
          type: 'sprint.started',
          title: `🚀 Sprint Started: ${result.sprintName}`,
          message: `Sprint "${result.sprintName}" has started.`,
          lines: [
            `Sprint "${result.sprintName}" has started.`,
            result.goal ? `Goal: ${result.goal}` : '',
          ].filter(Boolean),
          link: `/sprints/${id}`,
          actionLabel: 'View Sprint',
        });
      } catch {
        // Ignore background error
      }
    })();

    return result.updated;
  }

  async finish(id: string, actorId: string, input?: FinishSprintDto) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const sprint = await transaction.sprint.findUnique({
        where: { id },
        include: {
          tasks: {
            include: {
              column: { select: { name: true, isDone: true } },
              subtasks: {
                include: { column: { select: { name: true, isDone: true } } },
              },
            },
          },
          subtasks: {
            include: {
              column: { select: { name: true, isDone: true } },
              task: { select: { title: true } },
            },
          },
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
          column?: { name: string; isDone: boolean } | null;
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
          data: Array.from(subtasks.values()).map((subtask) => {
            const isDone =
              subtask.isCompleted ||
              Boolean(subtask.column?.isDone) ||
              subtask.column?.name?.trim().toLowerCase() === 'done';
            return {
              sprintId: id,
              subtaskId: subtask.id,
              taskId: subtask.taskId,
              taskTitle: subtask.taskTitle,
              title: subtask.title,
              estimateValue: subtask.estimateValue,
              estimateUnit: subtask.estimateUnit,
              wasDone: isDone,
              completedAt,
            };
          }),
        });
      }
      const unfinishedTaskIds = sprint.tasks
        .filter((task) => !task.column.isDone)
        .map((task) => task.id);
      const unfinishedSubtasks = Array.from(subtasks.values()).filter((subtask) => {
        const isDone =
          subtask.isCompleted ||
          Boolean(subtask.column?.isDone) ||
          subtask.column?.name?.trim().toLowerCase() === 'done';
        return !isDone;
      });
      const unfinishedSubtaskIds = unfinishedSubtasks.map((subtask) => subtask.id);
      const standaloneSubtaskIds = unfinishedSubtasks
        .filter((subtask) => !unfinishedTaskIds.includes(subtask.taskId))
        .map((subtask) => subtask.id);

      let nextSprint: { id: string; name: string } | null = null;

      if (unfinishedTaskIds.length || standaloneSubtaskIds.length) {
        if (input?.targetSprintId) {
          const target = await transaction.sprint.findUnique({
            where: { id: input.targetSprintId },
            select: { id: true, name: true, status: true, workspaceId: true },
          });
          if (!target || target.workspaceId !== sprint.workspaceId) {
            throw new BadRequestException('Target sprint not found.');
          }
          if (target.status !== SprintStatus.PLANNED) {
            throw new BadRequestException('Target sprint must be a planned sprint.');
          }
          nextSprint = target;
        } else {
          nextSprint = await transaction.sprint.findFirst({
            where: {
              workspaceId: sprint.workspaceId,
              status: SprintStatus.PLANNED,
            },
            orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true, name: true },
          });

          if (!nextSprint) {
            const allWorkspaceSprints = await transaction.sprint.findMany({
              where: { workspaceId: sprint.workspaceId },
              select: { name: true },
            });
            const nextSprintName = generateNextSprintName(
              sprint.name,
              allWorkspaceSprints.map((s) => s.name),
            );
            nextSprint = await transaction.sprint.create({
              data: {
                workspaceId: sprint.workspaceId,
                name: nextSprintName,
                status: SprintStatus.PLANNED,
              },
              select: { id: true, name: true },
            });
            await this.event(transaction, 'sprint.created', nextSprint.id, actorId, {
              name: nextSprintName,
              workspaceId: sprint.workspaceId,
              autoCreatedOnSprintFinish: true,
            });
          }
        }

        for (const taskId of unfinishedTaskIds) {
          await transaction.subtask.updateMany({
            where: { taskId, isCompleted: false },
            data: { sprintId: nextSprint.id },
          });
          await transaction.task.update({
            where: { id: taskId },
            data: { sprintId: nextSprint.id },
          });
        }

        if (standaloneSubtaskIds.length) {
          await transaction.subtask.updateMany({
            where: { id: { in: standaloneSubtaskIds } },
            data: { sprintId: nextSprint.id },
          });
        }
      }

      const updated = await transaction.sprint.update({
        where: { id },
        data: { status: SprintStatus.COMPLETED, completedAt },
      });
      const completedTasksCount = sprint.tasks.filter((task) => task.column.isDone).length;
      await this.event(transaction, 'sprint.finished', id, actorId, {
        completedAt,
        totalTasks: sprint.tasks.length,
        completedTasks: completedTasksCount,
        totalSubtasks: subtasks.size,
        completedSubtasks: subtasks.size - unfinishedSubtaskIds.length,
        movedToNextSprintTasks: unfinishedTaskIds.length,
        nextSprintId: nextSprint?.id ?? null,
        nextSprintName: nextSprint?.name ?? null,
        ...(sprint.workspaceId ? { workspaceId: sprint.workspaceId } : {}),
      });

      if (nextSprint && (unfinishedTaskIds.length || standaloneSubtaskIds.length)) {
        await this.event(transaction, 'sprint.work_carried_over', id, actorId, {
          taskIds: unfinishedTaskIds,
          subtaskIds: standaloneSubtaskIds,
          targetSprintId: nextSprint.id,
        });
      }

      return {
        updated,
        workspaceId: sprint.workspaceId,
        sprintName: sprint.name,
        totalTasks: sprint.tasks.length,
        completedTasks: completedTasksCount,
        remainingTasks: sprint.tasks.length - completedTasksCount,
        nextSprintId: nextSprint?.id ?? null,
        nextSprintName: nextSprint?.name ?? null,
      };
    });

    this.events?.emitBoardUpdate(result.workspaceId, 'sprint.finished', id, actorId);
    if (result.nextSprintId) {
      this.events?.emitBoardUpdate(result.workspaceId, 'sprint.work_carried_over', id, actorId);
    }

    void (async () => {
      try {
        const activeUsers = await this.prisma.user.findMany({
          where: { isActive: true },
          select: { id: true },
        });
        const incompleteMsg = result.nextSprintName
          ? `${result.remainingTasks} incomplete task(s) moved to "${result.nextSprintName}".`
          : `${result.remainingTasks} incomplete.`;
        await this.notifications.dispatch({
          recipientUserIds: activeUsers.map((u) => u.id),
          actorId,
          type: 'sprint.finished',
          title: `🏁 Sprint Completed: ${result.sprintName}`,
          message: `Sprint "${result.sprintName}" was completed. ${result.completedTasks} task(s) done, ${incompleteMsg}`,
          lines: [
            `Sprint "${result.sprintName}" has been completed.`,
            `Completed tasks: ${result.completedTasks}`,
            result.nextSprintName
              ? `Incomplete tasks moved to "${result.nextSprintName}": ${result.remainingTasks}`
              : `Incomplete tasks: ${result.remainingTasks}`,
          ],
          link: `/sprints/${id}`,
          actionLabel: 'View Sprint Retro',
        });
      } catch {
        // Ignore background error
      }
    })();

    return result.updated;
  }

  async carryOver(id: string, input: CarryOverDto, actorId: string) {
    const taskIds = input.taskIds ?? [];
    const subtaskIds = input.subtaskIds ?? [];
    this.assertWorkSelected(taskIds, subtaskIds);
    if (id === input.targetSprintId)
      throw new BadRequestException('Choose a different planned sprint for carry-over.');
    const result = await this.prisma.$transaction(async (transaction) => {
      const [source, target] = await Promise.all([
        transaction.sprint.findUnique({
          where: { id },
          select: { status: true, workspaceId: true },
        }),
        transaction.sprint.findUnique({
          where: { id: input.targetSprintId },
          select: { status: true, workspaceId: true },
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
        where: { workspaceId: target.workspaceId },
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
          data: {
            sprintId: input.targetSprintId,
            columnId: todoColumnId,
            position,
            workspaceId: target.workspaceId,
          },
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
        workspaceId: target.workspaceId,
        moved: tasks.length + standaloneSubtaskIds.length,
        movedTasks: tasks.length,
        movedSubtasks: standaloneSubtaskIds.length,
        targetSprintId: input.targetSprintId,
      };
    });
    this.events?.emitBoardUpdate(result.workspaceId, 'sprint.work_carried_over', id, actorId);
    return {
      moved: result.moved,
      movedTasks: result.movedTasks,
      movedSubtasks: result.movedSubtasks,
      targetSprintId: result.targetSprintId,
    };
  }

  async moveToBacklog(id: string, input: ResolveSprintWorkDto, actorId: string) {
    const taskIds = input.taskIds ?? [];
    const subtaskIds = input.subtaskIds ?? [];
    this.assertWorkSelected(taskIds, subtaskIds);
    const result = await this.prisma.$transaction(async (transaction) => {
      const source = await transaction.sprint.findUnique({
        where: { id },
        select: { status: true, workspaceId: true },
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
        where: { workspaceId: source.workspaceId },
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
          // Keep completed child work in the completed sprint's history. Only
          // unfinished work belongs back in the backlog with its parent task.
          where: { taskId: task.id, columnId: task.columnId, isCompleted: false },
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
        workspaceId: source.workspaceId,
        moved: tasks.length + standaloneSubtaskIds.length,
        movedTasks: tasks.length,
        movedSubtasks: standaloneSubtaskIds.length,
      };
    });
    this.events?.emitBoardUpdate(result.workspaceId, 'sprint.work_moved_to_backlog', id, actorId);
    return {
      moved: result.moved,
      movedTasks: result.movedTasks,
      movedSubtasks: result.movedSubtasks,
    };
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
    const comment = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.sprintComment.create({
        data: { sprintId: id, authorId: actorId, body },
        include: { author: { select: authorSelect } },
      });
      await this.event(transaction, 'sprint.comment_created', id, actorId, {
        commentId: created.id,
      });
      return created;
    });

    void (async () => {
      try {
        const [sprintRecord, otherCommenters] = await Promise.all([
          this.prisma.sprint.findUnique({
            where: { id },
            include: { tasks: { include: { assignees: { select: { userId: true } } } } },
          }),
          this.prisma.sprintComment.findMany({
            where: { sprintId: id },
            select: { authorId: true },
          }),
        ]);
        if (sprintRecord) {
          const taskAssigneeIds = sprintRecord.tasks.flatMap((t) =>
            t.assignees.map((a) => a.userId),
          );
          const previousCommenterIds = otherCommenters.map((c) => c.authorId);
          const recipientIds = Array.from(new Set([...taskAssigneeIds, ...previousCommenterIds]));
          await this.notifications.dispatch({
            recipientUserIds: recipientIds,
            actorId,
            type: 'sprint.comment',
            title: `💬 New Discussion on Sprint "${sprintRecord.name}"`,
            message: `A new comment was posted on sprint "${sprintRecord.name}": "${body.slice(0, 100)}${body.length > 100 ? '…' : ''}"`,
            lines: [`"${body}"`],
            link: `/sprints/${id}`,
            actionLabel: 'View Discussion',
          });
        }
      } catch {
        // Ignore background error
      }
    })();

    return comment;
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
