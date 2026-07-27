export type UserRole = 'ADMIN' | 'MEMBER';

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  avatarSeed: string;
  isBootstrapAdmin: boolean;
}

export interface ManagedUser extends CurrentUser {
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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

export type EstimateUnit = 'MINUTES' | 'POINTS';

export interface Estimate {
  value: number;
  unit: EstimateUnit;
}

export interface UserSummary {
  id: string;
  displayName: string;
  avatarSeed: string;
  isActive: boolean;
}

export interface BoardColumn {
  id: string;
  name: string;
  color: string;
  position: number;
  isBacklog?: boolean;
  isDone: boolean;
  tasks?: TaskCard[];
}

export interface TaskCard {
  id: string;
  title: string;
  description: string | null;
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
  uploadedBy: UserSummary;
  createdAt: string;
}

export interface Subtask {
  id: string;
  taskId: string;
  columnId: string;
  title: string;
  description: string | null;
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
}

export interface SprintWorkSubtask {
  id: string;
  title: string;
  isCompleted: boolean;
  estimateValue: number | null;
  estimateUnit: EstimateUnit | null;
  assignee: UserSummary | null;
  sprint?: { id: string; name: string; status: SprintStatus } | null;
}

export interface SprintWorkTask {
  id: string;
  title: string;
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
  comments: SprintComment[];
  outcomes: { total: number; completed: number; incomplete: number; estimates: Record<string, number> };
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}
