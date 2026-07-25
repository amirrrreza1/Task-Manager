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
  subtasks: Array<{ id: string; isCompleted: boolean }>;
  _count: { attachments: number };
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
  columns: Array<BoardColumn & { tasks: TaskCard[] }>;
  settings: AppSettings;
}
