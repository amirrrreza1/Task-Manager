import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { ActivityQueryDto } from './dto/activity-query.dto';
import type { MemberReportQueryDto } from './dto/member-report-query.dto';

const actorSelect = {
  id: true,
  displayName: true,
  color: true,
  hasAvatar: true,
  isActive: true,
};

type SerializedSubtask = {
  id: string;
  title: string;
  isCompleted: boolean;
  estimateValue: number | null;
  estimateUnit: string | null;
  column: { id: string; name: string; isDone: boolean };
  task: { id: string; title: string } | null;
  sprint: { id: string; name: string; status: string } | null;
  assignee?: {
    id: string;
    displayName: string;
    color?: string;
    hasAvatar: boolean;
    isActive: boolean;
  } | null;
  parentTask?: { id: string; title: string };
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Activity log ────────────────────────────────────────────────────────────

  async activityLog(query: ActivityQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.actorId) where['actorId'] = query.actorId;
    if (query.entityType) where['entityType'] = query.entityType;
    if (query.eventType) where['eventType'] = query.eventType;

    if (query.from || query.to) {
      const createdAt: Record<string, Date> = {};
      if (query.from) createdAt['gte'] = new Date(query.from);
      if (query.to) {
        const to = new Date(query.to);
        to.setHours(23, 59, 59, 999);
        createdAt['lte'] = to;
      }
      where['createdAt'] = createdAt;
    }

    const records = await this.prisma.activityEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { actor: { select: actorSelect } },
    });

    const hasMore = records.length > query.limit;
    const items = hasMore ? records.slice(0, query.limit) : records;

    // Resolve a human-readable label for each entity so the UI doesn't need
    // to fire extra requests.
    type EventRow = (typeof records)[number];
    const enriched = await Promise.all(items.map((ev: EventRow) => this.labelEvent(ev)));

    return {
      items: enriched,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
  }

  private async labelEvent(ev: {
    id: string;
    eventType: string;
    entityType: string;
    entityId: string;
    actorId: string | null;
    payload: unknown;
    createdAt: Date;
    actor: {
      id: string;
      displayName: string;
      hasAvatar: boolean;
      isActive: boolean;
    } | null;
  }) {
    let entityLabel: string | null = null;

    try {
      switch (ev.entityType) {
        case 'task': {
          const t = await this.prisma.task.findUnique({
            where: { id: ev.entityId },
            select: { title: true },
          });
          entityLabel = t?.title ?? null;
          break;
        }
        case 'subtask': {
          const s = await this.prisma.subtask.findUnique({
            where: { id: ev.entityId },
            select: { title: true },
          });
          entityLabel = s?.title ?? null;
          break;
        }
        case 'sprint': {
          const sp = await this.prisma.sprint.findUnique({
            where: { id: ev.entityId },
            select: { name: true },
          });
          entityLabel = sp?.name ?? null;
          break;
        }
        case 'board_column': {
          const bc = await this.prisma.boardColumn.findUnique({
            where: { id: ev.entityId },
            select: { name: true },
          });
          entityLabel = bc?.name ?? null;
          break;
        }
        case 'user': {
          const u = await this.prisma.user.findUnique({
            where: { id: ev.entityId },
            select: { displayName: true },
          });
          entityLabel = u?.displayName ?? null;
          break;
        }
        case 'workspace': {
          const w = await this.prisma.workspace.findUnique({
            where: { id: ev.entityId },
            select: { name: true },
          });
          const payloadObj =
            ev.payload && typeof ev.payload === 'object'
              ? (ev.payload as Record<string, unknown>)
              : null;
          entityLabel = w?.name ?? (typeof payloadObj?.name === 'string' ? payloadObj.name : null);
          break;
        }
        case 'project': {
          const p = await this.prisma.project.findUnique({
            where: { id: ev.entityId },
            select: { name: true },
          });
          const payloadObj =
            ev.payload && typeof ev.payload === 'object'
              ? (ev.payload as Record<string, unknown>)
              : null;
          entityLabel = p?.name ?? (typeof payloadObj?.name === 'string' ? payloadObj.name : null);
          break;
        }
        default:
          break;
      }
    } catch {
      // label is best-effort; deleted entities return null
    }

    return { ...ev, entityLabel };
  }

  // ─── Member subtask-completion report ────────────────────────────────────────

  async memberReport(userId: string, query: MemberReportQueryDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: actorSelect,
    });
    if (!user) throw new NotFoundException('User not found.');

    const sprintFilter = query.sprintId
      ? {
          OR: [
            { sprintId: query.sprintId },
            { sprintId: null, task: { sprintId: query.sprintId } },
          ],
        }
      : {};

    const subtaskInclude = {
      task: {
        select: {
          id: true,
          title: true,
          sprint: { select: { id: true, name: true, status: true } },
        },
      },
      sprint: { select: { id: true, name: true, status: true } },
      column: { select: { id: true, name: true, isDone: true } },
      assignee: { select: actorSelect },
    } as const;

    const completedSubtasks = await this.prisma.subtask.findMany({
      where: {
        assigneeId: userId,
        isCompleted: true,
        ...sprintFilter,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: subtaskInclude,
    });

    // Also include incomplete subtasks assigned to this user (so we can show
    // in-progress work too), but tag them separately.
    const incompleteSubtasks = await this.prisma.subtask.findMany({
      where: {
        assigneeId: userId,
        isCompleted: false,
        ...sprintFilter,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: subtaskInclude,
    });

    const totalEstimateHours = this.sumEstimateHours(completedSubtasks);
    const totalEstimatePoints = this.sumEstimatePoints(completedSubtasks);

    return {
      user,
      sprintFilter: query.sprintId ?? null,
      completedSubtasks: completedSubtasks.map((s: (typeof completedSubtasks)[number]) =>
        this.serializeSubtask(s),
      ),
      incompleteSubtasks: incompleteSubtasks.map((s: (typeof incompleteSubtasks)[number]) =>
        this.serializeSubtask(s),
      ),
      totals: {
        completedCount: completedSubtasks.length,
        incompleteCount: incompleteSubtasks.length,
        estimateHours: totalEstimateHours,
        estimatePoints: totalEstimatePoints,
      },
    };
  }

  // ─── Sprint report ────────────────────────────────────────────────────────────

  async sprintReport(sprintId: string) {
    const sprint = await this.prisma.sprint.findUnique({
      where: { id: sprintId },
      include: {
        tasks: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          include: {
            column: { select: { id: true, name: true, isDone: true } },
            assignees: {
              include: { user: { select: actorSelect } },
              orderBy: { assignedAt: 'asc' },
            },
            subtasks: {
              where: {
                OR: [{ sprintId: null }, { sprintId }],
              },
              orderBy: { position: 'asc' },
              include: {
                assignee: { select: actorSelect },
                column: { select: { id: true, name: true, isDone: true } },
              },
            },
          },
        },
        subtasks: {
          // standalone subtasks (their parent task is NOT in this sprint)
          where: {
            OR: [
              { task: { sprintId: null } },
              { task: { sprintId: { not: sprintId } } },
            ],
          },
          orderBy: [{ task: { title: 'asc' } }, { position: 'asc' }],
          include: {
            assignee: { select: actorSelect },
            column: { select: { id: true, name: true, isDone: true } },
            task: { select: { id: true, title: true } },
          },
        },
        taskSnapshots: {
          orderBy: { title: 'asc' },
          include: {
            task: {
              include: {
                column: { select: { id: true, name: true, isDone: true } },
                assignees: {
                  include: { user: { select: actorSelect } },
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
              include: {
                assignee: { select: actorSelect },
                column: { select: { id: true, name: true, isDone: true } },
              },
            },
          },
        },
      },
    });
    if (!sprint) throw new NotFoundException('Sprint not found.');

    // Per-member contribution breakdown
    const memberMap = new Map<
      string,
      {
        user: {
          id: string;
          displayName: string;
          hasAvatar: boolean;
          isActive: boolean;
        };
        completedSubtasks: number;
        incompleteSubtasks: number;
        estimateHours: number;
        estimatePoints: number;
        subtasks: SerializedSubtask[];
      }
    >();

    const trackSubtask = (
      subtask: {
        id: string;
        title: string;
        isCompleted: boolean;
        estimateValue: number | null;
        estimateUnit: string | null;
        assigneeId: string | null;
        assignee: {
          id: string;
          displayName: string;
          hasAvatar: boolean;
          isActive: boolean;
        } | null;
        column: { id: string; name: string; isDone: boolean };
        taskId: string;
      },
      parentTask: { id: string; title: string },
    ) => {
      if (!subtask.assignee) return;
      const uid = subtask.assignee.id;
      if (!memberMap.has(uid)) {
        memberMap.set(uid, {
          user: subtask.assignee,
          completedSubtasks: 0,
          incompleteSubtasks: 0,
          estimateHours: 0,
          estimatePoints: 0,
          subtasks: [],
        });
      }
      const entry = memberMap.get(uid)!;
      entry.subtasks.push({
        ...this.serializeSubtask({ ...subtask, task: parentTask, sprint: null }),
        parentTask,
      });
      if (subtask.isCompleted) {
        entry.completedSubtasks++;
        if (subtask.estimateUnit === 'HOURS' && subtask.estimateValue)
          entry.estimateHours =
            Math.round((entry.estimateHours + subtask.estimateValue) * 100) / 100;
        if (subtask.estimateUnit === 'POINTS' && subtask.estimateValue)
          entry.estimatePoints += subtask.estimateValue;
      } else {
        entry.incompleteSubtasks++;
      }
    };

    if (sprint.status === 'COMPLETED' && sprint.taskSnapshots.length > 0) {
      // Group subtask snapshots by taskId
      const subtasksByTaskId = new Map<string, typeof sprint.subtaskSnapshots>();
      const standaloneSnapshots: typeof sprint.subtaskSnapshots = [];
      const taskSnapshotIds = new Set(
        sprint.taskSnapshots.map((ts) => ts.taskId).filter(Boolean) as string[],
      );

      for (const subSnap of sprint.subtaskSnapshots) {
        if (subSnap.taskId && taskSnapshotIds.has(subSnap.taskId)) {
          const list = subtasksByTaskId.get(subSnap.taskId) ?? [];
          list.push(subSnap);
          subtasksByTaskId.set(subSnap.taskId, list);
        } else {
          standaloneSnapshots.push(subSnap);
        }
      }

      const tasks = sprint.taskSnapshots.map((ts) => {
        const matchingSubtaskSnapshots = ts.taskId ? (subtasksByTaskId.get(ts.taskId) ?? []) : [];
        const taskSubtasks: SerializedSubtask[] = matchingSubtaskSnapshots.map((subSnap) => {
          const parentTask = { id: ts.taskId ?? ts.id, title: ts.title };
          const serialized: SerializedSubtask = {
            id: subSnap.subtaskId ?? subSnap.id,
            title: subSnap.title,
            isCompleted: subSnap.wasDone,
            estimateValue: subSnap.estimateValue,
            estimateUnit: subSnap.estimateUnit,
            column: {
              id: subSnap.subtask?.column?.id ?? '',
              name: subSnap.subtask?.column?.name ?? (subSnap.wasDone ? 'Done' : 'In Progress'),
              isDone: subSnap.wasDone,
            },
            task: parentTask,
            sprint: { id: sprint.id, name: sprint.name, status: sprint.status },
            assignee: subSnap.subtask?.assignee ?? null,
            parentTask,
          };
          if (subSnap.subtask?.assignee) {
            trackSubtask(
              {
                id: serialized.id,
                title: serialized.title,
                isCompleted: serialized.isCompleted,
                estimateValue: serialized.estimateValue,
                estimateUnit: serialized.estimateUnit,
                assigneeId: subSnap.subtask.assignee.id,
                assignee: subSnap.subtask.assignee,
                column: serialized.column,
                taskId: ts.taskId ?? ts.id,
              },
              parentTask,
            );
          }
          return serialized;
        });

        return {
          id: ts.taskId ?? ts.id,
          title: ts.title,
          estimateValue: ts.estimateValue,
          estimateUnit: ts.estimateUnit,
          isDone: ts.wasDone,
          column: {
            id: ts.task?.column?.id ?? '',
            name: ts.columnName,
            isDone: ts.wasDone,
          },
          assignees: ts.task?.assignees.map((a) => a.user) ?? [],
          subtasks: taskSubtasks,
        };
      });

      const standaloneSubtasks = standaloneSnapshots.map((subSnap) => {
        const parentTask = { id: subSnap.taskId ?? '', title: subSnap.taskTitle };
        const serialized: SerializedSubtask & { parentTask: { id: string; title: string } } = {
          id: subSnap.subtaskId ?? subSnap.id,
          title: subSnap.title,
          isCompleted: subSnap.wasDone,
          estimateValue: subSnap.estimateValue,
          estimateUnit: subSnap.estimateUnit,
          column: {
            id: subSnap.subtask?.column?.id ?? '',
            name: subSnap.subtask?.column?.name ?? (subSnap.wasDone ? 'Done' : 'In Progress'),
            isDone: subSnap.wasDone,
          },
          task: parentTask,
          sprint: { id: sprint.id, name: sprint.name, status: sprint.status },
          assignee: subSnap.subtask?.assignee ?? null,
          parentTask,
        };
        if (subSnap.subtask?.assignee) {
          trackSubtask(
            {
              id: serialized.id,
              title: serialized.title,
              isCompleted: serialized.isCompleted,
              estimateValue: serialized.estimateValue,
              estimateUnit: serialized.estimateUnit,
              assigneeId: subSnap.subtask.assignee.id,
              assignee: subSnap.subtask.assignee,
              column: serialized.column,
              taskId: subSnap.taskId ?? '',
            },
            parentTask,
          );
        }
        return serialized;
      });

      const allTasksDone = sprint.taskSnapshots.filter((ts) => ts.wasDone).length;
      const allSubtasksDone = sprint.subtaskSnapshots.filter((ss) => ss.wasDone).length;

      return {
        sprint: {
          id: sprint.id,
          name: sprint.name,
          goal: sprint.goal,
          status: sprint.status,
          startsAt: sprint.startsAt,
          endsAt: sprint.endsAt,
          completedAt: sprint.completedAt,
        },
        tasks,
        standaloneSubtasks,
        taskSnapshots: sprint.taskSnapshots,
        memberContributions: Array.from(memberMap.values()),
        totals: {
          taskCount: sprint.taskSnapshots.length,
          tasksDone: allTasksDone,
          subtaskCount: sprint.subtaskSnapshots.length,
          subtasksDone: allSubtasksDone,
        },
      };
    }

    // Tasks in sprint
    const tasks = sprint.tasks.map((task: (typeof sprint.tasks)[number]) => {
      const isDone = task.column.isDone;
      for (const sub of task.subtasks) {
        trackSubtask(sub, { id: task.id, title: task.title });
      }
      return {
        id: task.id,
        title: task.title,
        estimateValue: task.estimateValue,
        estimateUnit: task.estimateUnit,
        isDone,
        column: task.column,
        assignees: task.assignees.map((a: (typeof task.assignees)[number]) => a.user),
        subtasks: task.subtasks.map((s: (typeof task.subtasks)[number]) =>
          this.serializeSubtask({
            ...s,
            task: { id: task.id, title: task.title },
            sprint: { id: sprint.id, name: sprint.name, status: sprint.status },
          }),
        ),
      };
    });

    // Standalone subtasks
    const standaloneSubtasks = sprint.subtasks.map((s: (typeof sprint.subtasks)[number]) => {
      trackSubtask({ ...s, taskId: s.task.id }, { id: s.task.id, title: s.task.title });
      return {
        ...this.serializeSubtask({
          ...s,
          task: s.task,
          sprint: { id: sprint.id, name: sprint.name, status: sprint.status },
        }),
        parentTask: { id: s.task.id, title: s.task.title },
      };
    });

    // Aggregate totals
    const allTasksDone = sprint.tasks.filter(
      (t: (typeof sprint.tasks)[number]) => t.column.isDone,
    ).length;
    const allSubtasksDone = [
      ...sprint.tasks.flatMap((t: (typeof sprint.tasks)[number]) => t.subtasks),
      ...sprint.subtasks,
    ].filter((s) => s.isCompleted).length;

    const totalSubtasks =
      sprint.tasks.flatMap((t: (typeof sprint.tasks)[number]) => t.subtasks).length +
      sprint.subtasks.length;

    return {
      sprint: {
        id: sprint.id,
        name: sprint.name,
        goal: sprint.goal,
        status: sprint.status,
        startsAt: sprint.startsAt,
        endsAt: sprint.endsAt,
        completedAt: sprint.completedAt,
      },
      tasks,
      standaloneSubtasks,
      taskSnapshots: sprint.taskSnapshots,
      memberContributions: Array.from(memberMap.values()),
      totals: {
        taskCount: sprint.tasks.length,
        tasksDone: allTasksDone,
        subtaskCount: totalSubtasks,
        subtasksDone: allSubtasksDone,
      },
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private serializeSubtask(s: {
    id: string;
    title: string;
    isCompleted: boolean;
    estimateValue: number | null;
    estimateUnit: string | null;
    column: { id: string; name: string; isDone: boolean };
    task?: {
      id: string;
      title: string;
      sprint?: { id: string; name: string; status: string } | null;
    } | null;
    sprint?: { id: string; name: string; status: string } | null;
    assignee?: {
      id: string;
      displayName: string;
      color?: string;
      hasAvatar: boolean;
      isActive: boolean;
    } | null;
  }) {
    return {
      id: s.id,
      title: s.title,
      isCompleted: s.isCompleted,
      estimateValue: s.estimateValue,
      estimateUnit: s.estimateUnit,
      column: s.column,
      task: s.task ? { id: s.task.id, title: s.task.title } : null,
      sprint: s.sprint ?? s.task?.sprint ?? null,
      assignee: s.assignee ?? null,
    };
  }

  private sumEstimateHours(
    subtasks: Array<{ estimateValue: number | null; estimateUnit: string | null }>,
  ) {
    const sum = subtasks
      .filter((s) => s.estimateUnit === 'HOURS' && s.estimateValue)
      .reduce((acc, s) => acc + (s.estimateValue ?? 0), 0);
    return Math.round(sum * 100) / 100;
  }

  private sumEstimatePoints(
    subtasks: Array<{ estimateValue: number | null; estimateUnit: string | null }>,
  ) {
    return subtasks
      .filter((s) => s.estimateUnit === 'POINTS' && s.estimateValue)
      .reduce((acc, s) => acc + (s.estimateValue ?? 0), 0);
  }
}
