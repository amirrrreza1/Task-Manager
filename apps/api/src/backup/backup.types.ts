export interface BackupMetadata {
  version: number;
  exportedAt: string;
  counts: {
    users: number;
    workspaces: number;
    projects: number;
    boardColumns: number;
    sprints: number;
    tasks: number;
    subtasks: number;
    attachments: number;
    comments: number;
    activityEvents: number;
  };
  hasAttachments: boolean;
}

export interface BackupData {
  metadata: BackupMetadata;
  appSettings: any[];
  notificationConfigs: any[];
  users: any[];
  workspaces: any[];
  projects: any[];
  projectSeniors: any[];
  boardColumns: any[];
  sprints: any[];
  tasks: any[];
  taskProjects: any[];
  taskAssignments: any[];
  subtasks: any[];
  attachments: any[];
  workItemComments: any[];
  sprintComments: any[];
  sprintTaskSnapshots: any[];
  sprintSubtaskSnapshots: any[];
  activityEvents: any[];
  notifications: any[];
}

export interface BackupStatus {
  databaseReady: boolean;
  totalCounts: {
    users: number;
    workspaces: number;
    projects: number;
    tasks: number;
    subtasks: number;
    attachments: number;
  };
  storageSizeBytes: number;
  telegramConfigured: boolean;
  telegramEnabled: boolean;
  telegramChatId: string | null;
  lastBackupAt: string | null;
}

export interface RestoreResult {
  success: boolean;
  message: string;
  restoredAt: string;
  counts: {
    users: number;
    workspaces: number;
    projects: number;
    boardColumns: number;
    sprints: number;
    tasks: number;
    subtasks: number;
    attachments: number;
    comments: number;
  };
}
