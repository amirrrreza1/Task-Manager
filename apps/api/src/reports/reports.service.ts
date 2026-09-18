import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskType } from '@prisma/client';
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
  task: { id: string; title: string; type?: TaskType } | null;
  sprint: { id: string; name: string; status: string } | null;
  assignee?: {
    id: string;
    displayName: string;
    color?: string;
    hasAvatar: boolean;
    isActive: boolean;
  } | null;
  parentTask?: { id: string; title: string; type?: TaskType };
};

type SerializedMemberTask = {
  id: string;
  title: string;
  type: TaskType;
  isDone: boolean;
  estimateValue: number | null;
  estimateUnit: string | null;
  column: { id: string; name: string; isDone: boolean };
  sprint: { id: string; name: string; status: string } | null;
};

type SerializedMemberUser = {
  id: string;
  displayName: string;
  color: string;
  hasAvatar: boolean;
  isActive: boolean;
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

  // ─── Member workload report ──────────────────────────────────────────────────

  async memberReport(userId: string, query: MemberReportQueryDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: actorSelect,
    });
    if (!user) throw new NotFoundException('User not found.');

    const selectedSprint = query.sprintId
      ? await this.prisma.sprint.findUnique({
          where: { id: query.sprintId },
          select: {
            id: true,
            name: true,
            status: true,
            taskSnapshots: {
              orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
              include: {
                task: {
                  select: {
                    type: true,
                    assignees: {
                      include: { user: { select: actorSelect } },
                    },
                  },
                },
              },
            },
            subtaskSnapshots: {
              orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
              include: {
                subtask: {
                  select: {
                    assignee: { select: actorSelect },
                    task: { select: { type: true } },
                  },
                },
              },
            },
          },
        })
      : null;

    if (query.sprintId && !selectedSprint) throw new NotFoundException('Sprint not found.');

    // Completed sprints move unfinished work forward. Use the finish snapshots
    // so the member report describes that sprint's actual closing outcome rather
    // than only the items that still point at it today.
    if (selectedSprint?.status === 'COMPLETED') {
      const sprintRef = {
        id: selectedSprint.id,
        name: selectedSprint.name,
        status: selectedSprint.status,
      };
      const assignedTasks: SerializedMemberTask[] = selectedSprint.taskSnapshots
        .filter((snapshot) =>
          snapshot.task?.assignees.some((assignment) => assignment.user.id === userId),
        )
        .map((snapshot) => ({
          id: snapshot.taskId ?? snapshot.id,
          title: snapshot.title,
          type: snapshot.task?.type ?? 'TASK',
          isDone: snapshot.wasDone,
          estimateValue: snapshot.estimateValue,
          estimateUnit: snapshot.estimateUnit,
          column: {
            id: '',
            name: snapshot.columnName,
            isDone: snapshot.wasDone,
          },
          sprint: sprintRef,
        }));
      const assignedSubtasks: SerializedSubtask[] = selectedSprint.subtaskSnapshots
        .filter((snapshot) => snapshot.subtask?.assignee?.id === userId)
        .map((snapshot) => ({
          id: snapshot.subtaskId ?? snapshot.id,
          title: snapshot.title,
          isCompleted: snapshot.wasDone,
          estimateValue: snapshot.estimateValue,
          estimateUnit: snapshot.estimateUnit,
          column: {
            id: '',
            name: snapshot.wasDone ? 'Done at sprint end' : 'Not done at sprint end',
            isDone: snapshot.wasDone,
          },
          task: snapshot.taskId
            ? {
                id: snapshot.taskId,
                title: snapshot.taskTitle,
                type: snapshot.subtask?.task.type ?? 'TASK',
              }
            : null,
          sprint: sprintRef,
          assignee: snapshot.subtask?.assignee ?? null,
        }));

      return this.memberReportPayload(user, selectedSprint.id, assignedTasks, assignedSubtasks);
    }

    const sprintCondition: Prisma.SubtaskWhereInput | undefined = query.sprintId
      ? {
          OR: [
            { sprintId: query.sprintId },
            { sprintId: null, task: { sprintId: query.sprintId } },
          ],
        }
      : undefined;

    // Fetch every assigned subtask in the selected scope and classify it in one
    // place. The former two-query approach could omit active work when a custom
    // done column name or mixed completion flags were used.
    const assignedSubtasks = await this.prisma.subtask.findMany({
      where: {
        assigneeId: userId,
        ...(sprintCondition ? sprintCondition : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: {
        task: {
          select: {
            id: true,
            title: true,
            type: true,
            sprint: { select: { id: true, name: true, status: true } },
          },
        },
        sprint: { select: { id: true, name: true, status: true } },
        column: { select: { id: true, name: true, isDone: true } },
        assignee: { select: actorSelect },
      },
    });

    const serializedSubtasks = assignedSubtasks.map((s) => this.serializeSubtask(s));
    const assignedTasksRaw = await this.prisma.task.findMany({
      where: {
        assignees: { some: { userId } },
        ...(query.sprintId ? { sprintId: query.sprintId } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        title: true,
        type: true,
        estimateValue: true,
        estimateUnit: true,
        column: { select: { id: true, name: true, isDone: true } },
        sprint: { select: { id: true, name: true, status: true } },
      },
    });

    const assignedTasks: SerializedMemberTask[] = assignedTasksRaw.map((task) => ({
      ...task,
      isDone: task.column.isDone || task.column.name.trim().toLowerCase() === 'done',
    }));
    return this.memberReportPayload(
      user,
      query.sprintId ?? null,
      assignedTasks,
      serializedSubtasks,
    );
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
            OR: [{ task: { sprintId: null } }, { task: { sprintId: { not: sprintId } } }],
          },
          orderBy: [{ task: { title: 'asc' } }, { position: 'asc' }],
          include: {
            assignee: { select: actorSelect },
            column: { select: { id: true, name: true, isDone: true } },
            task: { select: { id: true, title: true, type: true } },
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
                task: { select: { type: true } },
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
      parentTask: { id: string; title: string; type?: TaskType },
    ) => {
      if (!subtask.assignee) return;
      const isDone =
        subtask.isCompleted ||
        Boolean(subtask.column?.isDone) ||
        subtask.column?.name?.trim().toLowerCase() === 'done';
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
        ...this.serializeSubtask({
          ...subtask,
          isCompleted: isDone,
          task: parentTask,
          sprint: null,
        }),
        parentTask,
      });
      if (isDone) {
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
        const taskType: TaskType = ts.task?.type ?? 'TASK';
        const parentTask = { id: ts.taskId ?? ts.id, title: ts.title, type: taskType };
        const taskSubtasks: SerializedSubtask[] = matchingSubtaskSnapshots.map((subSnap) => {
          const isDone =
            subSnap.wasDone ||
            Boolean(subSnap.subtask?.column?.isDone) ||
            subSnap.subtask?.column?.name?.trim().toLowerCase() === 'done';
          const serialized: SerializedSubtask = {
            id: subSnap.subtaskId ?? subSnap.id,
            title: subSnap.title,
            isCompleted: isDone,
            estimateValue: subSnap.estimateValue,
            estimateUnit: subSnap.estimateUnit,
            column: {
              id: subSnap.subtask?.column?.id ?? '',
              name: subSnap.subtask?.column?.name ?? (isDone ? 'Done' : 'In Progress'),
              isDone: isDone,
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
          type: taskType,
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
        const parentTask = {
          id: subSnap.taskId ?? '',
          title: subSnap.taskTitle,
          type: subSnap.subtask?.task?.type ?? 'TASK',
        };
        const isDone =
          subSnap.wasDone ||
          Boolean(subSnap.subtask?.column?.isDone) ||
          subSnap.subtask?.column?.name?.trim().toLowerCase() === 'done';
        const serialized: SerializedSubtask & {
          parentTask: { id: string; title: string; type?: TaskType };
        } = {
          id: subSnap.subtaskId ?? subSnap.id,
          title: subSnap.title,
          isCompleted: isDone,
          estimateValue: subSnap.estimateValue,
          estimateUnit: subSnap.estimateUnit,
          column: {
            id: subSnap.subtask?.column?.id ?? '',
            name: subSnap.subtask?.column?.name ?? (isDone ? 'Done' : 'In Progress'),
            isDone: isDone,
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

      const standardTasks = sprint.taskSnapshots.filter(
        (ts) => (ts.task?.type ?? 'TASK') === 'TASK',
      );
      const bugTasks = sprint.taskSnapshots.filter((ts) => ts.task?.type === 'BUG');
      const allTasksDone = sprint.taskSnapshots.filter((ts) => ts.wasDone).length;
      const standardTasksDone = standardTasks.filter((ts) => ts.wasDone).length;
      const bugsDone = bugTasks.filter((ts) => ts.wasDone).length;
      const allSubtasksDone = sprint.subtaskSnapshots.filter(
        (ss) =>
          ss.wasDone ||
          Boolean(ss.subtask?.column?.isDone) ||
          ss.subtask?.column?.name?.trim().toLowerCase() === 'done',
      ).length;

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
          standardTaskCount: standardTasks.length,
          standardTasksDone,
          bugCount: bugTasks.length,
          bugsDone,
          subtaskCount: sprint.subtaskSnapshots.length,
          subtasksDone: allSubtasksDone,
        },
      };
    }

    // Tasks in sprint
    const tasks = sprint.tasks.map((task: (typeof sprint.tasks)[number]) => {
      const isDone = task.column.isDone;
      for (const sub of task.subtasks) {
        const isSubDone =
          sub.isCompleted ||
          Boolean(sub.column?.isDone) ||
          sub.column?.name?.trim().toLowerCase() === 'done';
        trackSubtask(
          { ...sub, isCompleted: isSubDone },
          { id: task.id, title: task.title, type: task.type },
        );
      }
      return {
        id: task.id,
        title: task.title,
        type: task.type,
        estimateValue: task.estimateValue,
        estimateUnit: task.estimateUnit,
        isDone,
        column: task.column,
        assignees: task.assignees.map((a: (typeof task.assignees)[number]) => a.user),
        subtasks: task.subtasks.map((s: (typeof task.subtasks)[number]) => {
          const isSubDone =
            s.isCompleted ||
            Boolean(s.column?.isDone) ||
            s.column?.name?.trim().toLowerCase() === 'done';
          return this.serializeSubtask({
            ...s,
            isCompleted: isSubDone,
            column: {
              ...s.column,
              isDone: isSubDone,
            },
            task: { id: task.id, title: task.title, type: task.type },
            sprint: { id: sprint.id, name: sprint.name, status: sprint.status },
          });
        }),
      };
    });

    // Standalone subtasks
    const standaloneSubtasks = sprint.subtasks.map((s: (typeof sprint.subtasks)[number]) => {
      const isSubDone =
        s.isCompleted ||
        Boolean(s.column?.isDone) ||
        s.column?.name?.trim().toLowerCase() === 'done';
      trackSubtask(
        { ...s, taskId: s.task.id, isCompleted: isSubDone },
        { id: s.task.id, title: s.task.title, type: s.task.type },
      );
      return {
        ...this.serializeSubtask({
          ...s,
          isCompleted: isSubDone,
          column: {
            ...s.column,
            isDone: isSubDone,
          },
          task: s.task,
          sprint: { id: sprint.id, name: sprint.name, status: sprint.status },
        }),
        parentTask: { id: s.task.id, title: s.task.title, type: s.task.type },
      };
    });

    // Aggregate totals
    const standardTasks = sprint.tasks.filter(
      (t: (typeof sprint.tasks)[number]) => t.type === 'TASK',
    );
    const bugTasks = sprint.tasks.filter((t: (typeof sprint.tasks)[number]) => t.type === 'BUG');
    const allTasksDone = sprint.tasks.filter(
      (t: (typeof sprint.tasks)[number]) => t.column.isDone,
    ).length;
    const standardTasksDone = standardTasks.filter((t) => t.column.isDone).length;
    const bugsDone = bugTasks.filter((t) => t.column.isDone).length;

    const allSubtasksDone = [
      ...sprint.tasks.flatMap((t: (typeof sprint.tasks)[number]) => t.subtasks),
      ...sprint.subtasks,
    ].filter(
      (s) =>
        s.isCompleted ||
        Boolean(s.column?.isDone) ||
        s.column?.name?.trim().toLowerCase() === 'done',
    ).length;

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
        standardTaskCount: standardTasks.length,
        standardTasksDone,
        bugCount: bugTasks.length,
        bugsDone,
        subtaskCount: totalSubtasks,
        subtasksDone: allSubtasksDone,
      },
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private memberReportPayload(
    user: SerializedMemberUser,
    sprintFilter: string | null,
    assignedTasks: SerializedMemberTask[],
    assignedSubtasks: SerializedSubtask[],
  ) {
    const completedSubtasks = assignedSubtasks.filter((subtask) => subtask.isCompleted);
    const incompleteSubtasks = assignedSubtasks.filter((subtask) => !subtask.isCompleted);
    const completedTasks = assignedTasks.filter((task) => task.isDone).length;
    const totalWorkItems = assignedTasks.length + assignedSubtasks.length;
    const completedWorkItems = completedTasks + completedSubtasks.length;

    return {
      user,
      sprintFilter,
      assignedTasks,
      completedSubtasks,
      incompleteSubtasks,
      totals: {
        completedCount: completedSubtasks.length,
        incompleteCount: incompleteSubtasks.length,
        taskCount: assignedTasks.length,
        tasksDone: completedTasks,
        workItemCount: totalWorkItems,
        workItemsDone: completedWorkItems,
        completionRate:
          totalWorkItems > 0 ? Math.round((completedWorkItems / totalWorkItems) * 100) : 0,
        estimateHours: this.sumEstimateHours(completedSubtasks),
        estimatePoints: this.sumEstimatePoints(completedSubtasks),
      },
    };
  }

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
      type?: TaskType;
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
    const isDone =
      s.isCompleted || Boolean(s.column?.isDone) || s.column?.name?.trim().toLowerCase() === 'done';
    return {
      id: s.id,
      title: s.title,
      isCompleted: isDone,
      estimateValue: s.estimateValue,
      estimateUnit: s.estimateUnit,
      column: {
        ...s.column,
        isDone: isDone || Boolean(s.column?.isDone),
      },
      task: s.task ? { id: s.task.id, title: s.task.title, type: s.task.type ?? 'TASK' } : null,
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
