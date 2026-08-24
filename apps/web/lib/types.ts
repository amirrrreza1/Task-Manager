export type UserRole = 'ADMIN' | 'MEMBER';

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  color: string;
  email?: string | null;
  telegramUsername?: string | null;
  role: UserRole;
  hasAvatar: boolean;
  isBootstrapAdmin: boolean;
}

export interface ManagedUser extends CurrentUser {
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  actorId: string | null;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  emailSent: boolean;
  telegramSent: boolean;
  createdAt: string;
  actor?: {
    id: string;
    displayName: string;
    color: string;
    hasAvatar: boolean;
  } | null;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unreadCount: number;
  nextCursor: string | null;
}

export interface NotificationSettings {
  smtpConfigured: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpHasPassword: boolean;
  smtpFromEmail: string;
  smtpFromName: string;
  smtpEnabled: boolean;
  telegramConfigured: boolean;
  telegramHasBotToken: boolean;
  telegramHasChatId: boolean;
  telegramHasMessageThreadId?: boolean;
  telegramMessageThreadId?: number | null;
  telegramHasProxy?: boolean;
  telegramProxyUrl?: string | null;
  telegramEnvProxyUrl?: string | null;
  telegramEffectiveProxyUrl?: string | null;
  telegramEnabled: boolean;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  estimateMode: 'TIME' | 'POINTS';
  sprintDurationDays: number;
  createdAt: string;
  updatedAt: string;
  columns?: BoardColumn[];
  projects?: Project[];
  _count?: { tasks: number; sprints: number; columns: number };
}

export interface ProjectSenior {
  projectId: string;
  userId: string;
  assignedAt: string;
  user: UserSummary;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  key: string | null;
  description: string | null;
  color: string | null;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
  seniors?: ProjectSenior[];
  _count?: { tasks: number };
}

export interface AppSettings {
  id: string;
  estimateMode: 'TIME' | 'POINTS';
  sprintDurationDays: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  message?: string | string[];
  code?: string;
}

export type EstimateUnit = 'HOURS' | 'POINTS';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Estimate {
  value: number;
  unit: EstimateUnit;
}

export interface UserSummary {
  id: string;
  displayName: string;
  color: string;
  hasAvatar: boolean;
  isActive: boolean;
}

export interface BoardColumn {
  id: string;
  workspaceId?: string;
  name: string;
  color: string;
  position: number;
  isBacklog?: boolean;
  isTodo?: boolean;
  isReview?: boolean;
  isDone: boolean;
  tasks?: TaskCard[];
}

export interface TaskCard {
  id: string;
  workspaceId?: string;
  projectId?: string | null;
  project?: {
    id: string;
    name: string;
    key: string | null;
    color: string | null;
    icon: string | null;
    seniors?: ProjectSenior[];
  } | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  estimateValue: number | null;
  estimateUnit: EstimateUnit | null;
  position: string;
  columnId: string;
  sprintId: string | null;
  createdAt: string;
  updatedAt: string;
  assignees: Array<{ user: UserSummary }>;
  subtasks: BoardSubtask[];
  _count: { attachments: number };
}

export interface BoardSubtask {
  id: string;
  taskId: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  estimateValue: number | null;
  estimateUnit: EstimateUnit | null;
  isCompleted: boolean;
  position: number;
  assigneeId: string | null;
  assignee: UserSummary | null;
  _count: { attachments: number };
  parentTask?: { id: string; title: string };
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  ownerType: 'TASK' | 'SUBTASK';
  taskId: string | null;
  subtaskId: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  comment: string | null;
  uploadedBy: UserSummary;
  createdAt: string;
}

export interface Subtask {
  id: string;
  taskId: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  estimateValue: number | null;
  estimateUnit: EstimateUnit | null;
  isCompleted: boolean;
  position: number;
  assigneeId: string | null;
  assignee: UserSummary | null;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends Omit<TaskCard, 'subtasks' | '_count'> {
  column: BoardColumn;
  sprint: { id: string; name: string; status: string } | null;
  createdBy: UserSummary;
  subtasks: Subtask[];
  attachments: Attachment[];
}

export interface BoardResponse {
  columns: Array<BoardColumn & { tasks: TaskCard[]; subtasks: BoardSubtask[] }>;
  settings: AppSettings;
}

export type SprintStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED';

export interface SprintSummary {
  id: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  startsAt: string | null;
  endsAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number; taskSnapshots: number; comments: number };
}

export interface SprintComment {
  id: string;
  body: string;
  authorId: string;
  author: UserSummary;
  createdAt: string;
  updatedAt: string;
}

export interface SprintTaskSnapshot {
  id: string;
  taskId: string | null;
  title: string;
  estimateValue: number | null;
  estimateUnit: EstimateUnit | null;
  columnName: string;
  wasDone: boolean;
  completedAt: string;
  canCarryOver: boolean;
}

export interface SprintSubtaskSnapshot {
  id: string;
  subtaskId: string | null;
  taskId: string | null;
  taskTitle: string;
  title: string;
  estimateValue: number | null;
  estimateUnit: EstimateUnit | null;
  wasDone: boolean;
  completedAt: string;
  canCarryOver: boolean;
}

export interface SprintWorkSubtask {
  id: string;
  title: string;
  isCompleted: boolean;
  priority: TaskPriority;
  estimateValue: number | null;
  estimateUnit: EstimateUnit | null;
  assignee: UserSummary | null;
  sprint?: { id: string; name: string; status: SprintStatus } | null;
}

export interface SprintWorkTask {
  id: string;
  title: string;
  priority: TaskPriority;
  estimateValue: number | null;
  estimateUnit: EstimateUnit | null;
  sprintId: string | null;
  column: Pick<BoardColumn, 'id' | 'name' | 'isDone'>;
  assignees: Array<{ user: UserSummary }>;
  subtasks: SprintWorkSubtask[];
}

export interface AvailableSprintTask extends SprintWorkTask {
  sprint: { id: string; name: string; status: SprintStatus } | null;
}

export interface SprintStandaloneSubtask {
  id: string;
  title: string;
  isCompleted: boolean;
  priority: TaskPriority;
  estimateValue: number | null;
  estimateUnit: EstimateUnit | null;
  assignee: UserSummary | null;
  task: { id: string; title: string; column?: { name: string }; sprintId?: string | null };
}

export interface AvailableSprintSubtask extends SprintStandaloneSubtask {
  sprint: { id: string; name: string } | null;
}

export interface SprintDetail extends Omit<SprintSummary, '_count'> {
  tasks: SprintWorkTask[];
  subtasks: SprintStandaloneSubtask[];
  taskSnapshots: SprintTaskSnapshot[];
  subtaskSnapshots: SprintSubtaskSnapshot[];
  comments: SprintComment[];
  outcomes: {
    total: number;
    completed: number;
    incomplete: number;
    estimates: Record<string, number>;
  };
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export interface ActivityEventItem {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  actorId: string | null;
  actor: UserSummary | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ReportSubtask {
  id: string;
  title: string;
  isCompleted: boolean;
  estimateValue: number | null;
  estimateUnit: EstimateUnit | null;
  column: { id: string; name: string; isDone: boolean };
  task: { id: string; title: string } | null;
  sprint: { id: string; name: string; status: SprintStatus } | null;
}

export interface MemberReportTotals {
  completedCount: number;
  incompleteCount: number;
  estimateHours: number;
  estimatePoints: number;
}

export interface MemberReport {
  user: UserSummary;
  sprintFilter: string | null;
  completedSubtasks: ReportSubtask[];
  incompleteSubtasks: ReportSubtask[];
  totals: MemberReportTotals;
}

export interface SprintReportTask {
  id: string;
  title: string;
  estimateValue: number | null;
  estimateUnit: EstimateUnit | null;
  isDone: boolean;
  column: { id: string; name: string; isDone: boolean };
  assignees: UserSummary[];
  subtasks: ReportSubtask[];
}

export interface MemberContribution {
  user: UserSummary;
  completedSubtasks: number;
  incompleteSubtasks: number;
  estimateHours: number;
  estimatePoints: number;
  subtasks: (ReportSubtask & { parentTask: { id: string; title: string } })[];
}

export interface SprintReport {
  sprint: {
    id: string;
    name: string;
    goal: string | null;
    status: SprintStatus;
    startsAt: string | null;
    endsAt: string | null;
    completedAt: string | null;
  };
  tasks: SprintReportTask[];
  standaloneSubtasks: (ReportSubtask & { parentTask: { id: string; title: string } })[];
  taskSnapshots: SprintTaskSnapshot[];
  memberContributions: MemberContribution[];
  totals: {
    taskCount: number;
    tasksDone: number;
    subtaskCount: number;
    subtasksDone: number;
  };
}
