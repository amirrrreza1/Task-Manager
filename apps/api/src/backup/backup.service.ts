import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import AdmZip = require('adm-zip');
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { TelegramService } from '../infrastructure/telegram/telegram.service';
import { isTelegramConfigured, readTelegramEnv } from '../infrastructure/config/notification-env';
import type { BackupData, BackupMetadata, BackupStatus, RestoreResult } from './backup.types';

function serializeJson(data: unknown): string {
  return JSON.stringify(
    data,
    (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    2,
  );
}

function parseDate(val: unknown): Date | null {
  if (!val) return null;
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? null : d;
}

function parseRequiredDate(val: unknown, fallback: Date = new Date()): Date {
  if (!val) return fallback;
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? fallback : d;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly uploadDirectory: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly telegramService: TelegramService,
  ) {
    this.uploadDirectory = resolve(this.config.get<string>('UPLOAD_DIRECTORY', './uploads'));
  }

  async getStatus(): Promise<BackupStatus> {
    const [users, workspaces, projects, tasks, subtasks, attachments, lastEvent] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.workspace.count(),
        this.prisma.project.count(),
        this.prisma.task.count(),
        this.prisma.subtask.count(),
        this.prisma.attachment.count(),
        this.prisma.activityEvent.findFirst({
          where: { eventType: { startsWith: 'backup.' } },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    const flags = await this.prisma.notificationConfig.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    const telegramEnv = readTelegramEnv();

    let storageSizeBytes = 0;
    try {
      if (existsSync(this.uploadDirectory)) {
        const files = readdirSync(this.uploadDirectory);
        for (const file of files) {
          try {
            const stats = statSync(join(this.uploadDirectory, file));
            if (stats.isFile()) storageSizeBytes += stats.size;
          } catch {
            // ignore inaccessible files
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Could not compute uploads size: ${(err as Error).message}`);
    }

    return {
      databaseReady: true,
      totalCounts: {
        users,
        workspaces,
        projects,
        tasks,
        subtasks,
        attachments,
      },
      storageSizeBytes,
      telegramConfigured: isTelegramConfigured(telegramEnv),
      telegramEnabled: flags.telegramEnabled,
      telegramChatId: telegramEnv.chatId,
      lastBackupAt: lastEvent ? lastEvent.createdAt.toISOString() : null,
    };
  }

  private async collectBackupData(includeAttachments: boolean): Promise<BackupData> {
    const [
      appSettings,
      notificationConfigs,
      users,
      workspaces,
      projects,
      projectSeniors,
      boardColumns,
      sprints,
      tasks,
      taskProjects,
      taskAssignments,
      subtasks,
      attachments,
      workItemComments,
      sprintComments,
      sprintTaskSnapshots,
      sprintSubtaskSnapshots,
      activityEvents,
      notifications,
    ] = await Promise.all([
      this.prisma.appSettings.findMany(),
      this.prisma.notificationConfig.findMany(),
      this.prisma.user.findMany(),
      this.prisma.workspace.findMany(),
      this.prisma.project.findMany(),
      this.prisma.projectSenior.findMany(),
      this.prisma.boardColumn.findMany(),
      this.prisma.sprint.findMany(),
      this.prisma.task.findMany(),
      this.prisma.taskProject.findMany(),
      this.prisma.taskAssignment.findMany(),
      this.prisma.subtask.findMany(),
      this.prisma.attachment.findMany(),
      this.prisma.workItemComment.findMany(),
      this.prisma.sprintComment.findMany(),
      this.prisma.sprintTaskSnapshot.findMany(),
      this.prisma.sprintSubtaskSnapshot.findMany(),
      this.prisma.activityEvent.findMany({ take: 5000, orderBy: { createdAt: 'desc' } }),
      this.prisma.notification.findMany({ take: 5000, orderBy: { createdAt: 'desc' } }),
    ]);

    const metadata: BackupMetadata = {
      version: 1,
      exportedAt: new Date().toISOString(),
      counts: {
        users: users.length,
        workspaces: workspaces.length,
        projects: projects.length,
        boardColumns: boardColumns.length,
        sprints: sprints.length,
        tasks: tasks.length,
        subtasks: subtasks.length,
        attachments: attachments.length,
        comments: workItemComments.length + sprintComments.length,
        activityEvents: activityEvents.length,
      },
      hasAttachments: includeAttachments,
    };

    return {
      metadata,
      appSettings,
      notificationConfigs,
      users,
      workspaces,
      projects,
      projectSeniors,
      boardColumns,
      sprints,
      tasks,
      taskProjects,
      taskAssignments,
      subtasks,
      attachments,
      workItemComments,
      sprintComments,
      sprintTaskSnapshots,
      sprintSubtaskSnapshots,
      activityEvents,
      notifications,
    };
  }

  async createBackupFile(options: {
    includeAttachments?: boolean;
    format?: 'zip' | 'json';
    actorId?: string;
  }): Promise<{
    buffer: Buffer;
    filename: string;
    mimeType: string;
    metadata: BackupMetadata;
  }> {
    const includeAttachments = options.includeAttachments !== false;
    const format = options.format || (includeAttachments ? 'zip' : 'json');
    const data = await this.collectBackupData(includeAttachments);

    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);

    let buffer: Buffer;
    let filename: string;
    let mimeType: string;

    if (format === 'json' && !includeAttachments) {
      const jsonString = serializeJson(data);
      buffer = Buffer.from(jsonString, 'utf-8');
      filename = `task-manager-backup-${dateStr}.json`;
      mimeType = 'application/json';
    } else {
      const zip = new AdmZip();
      const jsonString = serializeJson(data);
      zip.addFile('backup.json', Buffer.from(jsonString, 'utf-8'));

      if (includeAttachments && existsSync(this.uploadDirectory)) {
        const storedKeys = new Set<string>();
        for (const att of data.attachments) {
          const key = att.storageKey ? String(att.storageKey) : null;
          if (key) storedKeys.add(key);
        }
        for (const u of data.users) {
          const key = u.avatarStorageKey ? String(u.avatarStorageKey) : null;
          if (key) storedKeys.add(key);
        }

        for (const key of storedKeys) {
          const filePath = resolve(this.uploadDirectory, key);
          if (filePath.startsWith(`${this.uploadDirectory}${sep}`) && existsSync(filePath)) {
            try {
              const fileBuf = await readFile(filePath);
              zip.addFile(`uploads/${key}`, fileBuf);
            } catch (err) {
              this.logger.warn(
                `Failed to include attachment ${key} in backup: ${(err as Error).message}`,
              );
            }
          }
        }
      }

      buffer = zip.toBuffer();
      filename = `task-manager-backup-${dateStr}.zip`;
      mimeType = 'application/zip';
    }

    if (options.actorId) {
      await this.prisma.activityEvent.create({
        data: {
          eventType: 'backup.created',
          entityType: 'backup',
          entityId: '00000000-0000-0000-0000-000000000000',
          actorId: options.actorId,
          payload: {
            format,
            includeAttachments,
            filename,
            sizeBytes: buffer.length,
            counts: data.metadata.counts,
          },
        },
      });
    }

    return {
      buffer,
      filename,
      mimeType,
      metadata: data.metadata,
    };
  }

  async sendToTelegram(
    options: { includeAttachments?: boolean },
    actorId: string,
  ): Promise<{ success: boolean; message: string; filename: string; sizeBytes: number }> {
    const backup = await this.createBackupFile({
      includeAttachments: options.includeAttachments !== false,
      format: 'zip',
      actorId,
    });

    const MAX_TELEGRAM_BYTES = 50 * 1024 * 1024; // 50MB
    if (backup.buffer.length > MAX_TELEGRAM_BYTES) {
      const sizeMB = (backup.buffer.length / (1024 * 1024)).toFixed(1);
      throw new BadRequestException(
        `Backup file size (${sizeMB} MB) exceeds Telegram Bot limit of 50 MB. Please download the backup directly or export without attachments.`,
      );
    }

    const mb = (backup.buffer.length / (1024 * 1024)).toFixed(2);
    const counts = backup.metadata.counts;
    const caption =
      `📦 <b>Task Manager System Backup</b>\n\n` +
      `📅 <b>Date:</b> <code>${backup.metadata.exportedAt}</code>\n` +
      `📁 <b>File:</b> <code>${backup.filename}</code>\n` +
      `💾 <b>Size:</b> ${mb} MB\n\n` +
      `📊 <b>Data Included:</b>\n` +
      `• ${counts.workspaces} Workspaces, ${counts.projects} Projects\n` +
      `• ${counts.tasks} Tasks, ${counts.subtasks} Subtasks\n` +
      `• ${counts.users} Users, ${counts.attachments} Attachments\n\n` +
      `<i>Automated system backup ready for restore.</i>`;

    const result = await this.telegramService.sendDocument({
      filename: backup.filename,
      buffer: backup.buffer,
      caption,
      mimeType: backup.mimeType,
    });

    await this.prisma.activityEvent.create({
      data: {
        eventType: 'backup.sent_telegram',
        entityType: 'backup',
        entityId: '00000000-0000-0000-0000-000000000000',
        actorId,
        payload: {
          filename: backup.filename,
          sizeBytes: backup.buffer.length,
          counts: backup.metadata.counts,
        },
      },
    });

    return {
      success: true,
      message: result.message || 'Backup file successfully sent to Telegram group.',
      filename: backup.filename,
      sizeBytes: backup.buffer.length,
    };
  }

  async restoreBackup(file: Express.Multer.File, actorId: string): Promise<RestoreResult> {
    if (!file || !file.path) {
      throw new BadRequestException('No backup file was uploaded.');
    }

    let backupData: BackupData;
    const extractedUploads: Map<string, Buffer> = new Map();

    try {
      const isZip =
        file.originalname.toLowerCase().endsWith('.zip') ||
        file.mimetype === 'application/zip' ||
        file.mimetype === 'application/x-zip-compressed';

      if (isZip) {
        const zip = new AdmZip(file.path);
        const entries = zip.getEntries();
        const jsonEntry = entries.find(
          (e) => !e.isDirectory && (e.entryName === 'backup.json' || e.entryName.endsWith('.json')),
        );

        if (!jsonEntry) {
          throw new BadRequestException(
            'Invalid backup ZIP archive: backup.json file not found inside.',
          );
        }

        const jsonText = jsonEntry.getData().toString('utf-8');
        try {
          backupData = JSON.parse(jsonText);
        } catch {
          throw new BadRequestException('Malformed JSON inside backup archive.');
        }

        // Collect uploaded attachments from zip safely
        for (const entry of entries) {
          if (!entry.isDirectory && entry.entryName.startsWith('uploads/')) {
            const relativeName = entry.entryName.replace(/^uploads\//, '');
            // Path traversal guard
            if (!relativeName.includes('..') && /^[a-f0-9]{64}$/.test(relativeName)) {
              extractedUploads.set(relativeName, entry.getData());
            }
          }
        }
      } else {
        const fileContent = await readFile(file.path, 'utf-8');
        try {
          backupData = JSON.parse(fileContent);
        } catch {
          throw new BadRequestException('Malformed JSON in uploaded backup file.');
        }
      }
    } finally {
      // Clean up uploaded temp file
      await rm(file.path, { force: true }).catch(() => {});
    }

    if (!backupData || !backupData.users || !backupData.workspaces || !backupData.tasks) {
      throw new BadRequestException(
        'The provided backup file does not contain valid Task Manager data structure.',
      );
    }

    const restoredActorId = backupData.users.some((user) => user.id === actorId) ? actorId : null;

    // Execute atomic restore in PostgreSQL transaction
    await this.prisma.$transaction(
      async (tx) => {
        // Clear in reverse dependency order
        await tx.outboxMessage.deleteMany();
        await tx.notification.deleteMany();
        await tx.activityEvent.deleteMany();
        await tx.refreshSession.deleteMany();
        await tx.workItemComment.deleteMany();
        await tx.sprintComment.deleteMany();
        await tx.sprintSubtaskSnapshot.deleteMany();
        await tx.sprintTaskSnapshot.deleteMany();
        await tx.attachment.deleteMany();
        await tx.subtask.deleteMany();
        await tx.taskAssignment.deleteMany();
        await tx.taskProject.deleteMany();
        await tx.task.deleteMany();
        await tx.projectSenior.deleteMany();
        await tx.project.deleteMany();
        await tx.sprint.deleteMany();
        await tx.boardColumn.deleteMany();
        await tx.workspace.deleteMany();
        await tx.user.deleteMany();

        // 1. AppSettings
        if (backupData.appSettings && backupData.appSettings.length > 0) {
          for (const s of backupData.appSettings) {
            await tx.appSettings.upsert({
              where: { id: s.id || 'default' },
              update: {
                estimateMode: s.estimateMode,
                sprintDurationDays: s.sprintDurationDays,
                revision: s.revision,
              },
              create: {
                id: s.id || 'default',
                estimateMode: s.estimateMode,
                sprintDurationDays: s.sprintDurationDays,
                revision: s.revision,
              },
            });
          }
        }

        // 2. NotificationConfig
        if (backupData.notificationConfigs && backupData.notificationConfigs.length > 0) {
          for (const nc of backupData.notificationConfigs) {
            await tx.notificationConfig.upsert({
              where: { id: nc.id || 'default' },
              update: {
                smtpEnabled: nc.smtpEnabled,
                telegramEnabled: nc.telegramEnabled,
                telegramProxyUrl: nc.telegramProxyUrl,
              },
              create: {
                id: nc.id || 'default',
                smtpEnabled: nc.smtpEnabled,
                telegramEnabled: nc.telegramEnabled,
                telegramProxyUrl: nc.telegramProxyUrl,
              },
            });
          }
        }

        // 3. Users
        if (backupData.users && backupData.users.length > 0) {
          for (const u of backupData.users) {
            await tx.user.create({
              data: {
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                color: u.color || '#2563eb',
                passwordHash: u.passwordHash,
                role: u.role,
                email: u.email || null,
                telegramUsername: u.telegramUsername || null,
                avatarStorageKey: u.avatarStorageKey || null,
                avatarMimeType: u.avatarMimeType || null,
                hasAvatar: u.hasAvatar ?? false,
                isActive: u.isActive ?? true,
                isBootstrapAdmin: u.isBootstrapAdmin ?? false,
                createdAt: parseRequiredDate(u.createdAt),
                updatedAt: parseRequiredDate(u.updatedAt),
              },
            });
          }
        }

        // 4. Workspaces
        if (backupData.workspaces && backupData.workspaces.length > 0) {
          for (const w of backupData.workspaces) {
            await tx.workspace.create({
              data: {
                id: w.id,
                name: w.name,
                description: w.description || null,
                estimateMode: w.estimateMode || 'TIME',
                sprintDurationDays: w.sprintDurationDays || 14,
                createdAt: parseRequiredDate(w.createdAt),
                updatedAt: parseRequiredDate(w.updatedAt),
              },
            });
          }
        }

        // 5. Board Columns
        if (backupData.boardColumns && backupData.boardColumns.length > 0) {
          for (const col of backupData.boardColumns) {
            await tx.boardColumn.create({
              data: {
                id: col.id,
                workspaceId: col.workspaceId,
                name: col.name,
                color: col.color || '#64748b',
                position: col.position,
                isBacklog: col.isBacklog ?? false,
                isTodo: col.isTodo ?? false,
                isReview: col.isReview ?? false,
                isDone: col.isDone ?? false,
                createdAt: parseRequiredDate(col.createdAt),
                updatedAt: parseRequiredDate(col.updatedAt),
              },
            });
          }
        }

        // 6. Sprints
        if (backupData.sprints && backupData.sprints.length > 0) {
          for (const s of backupData.sprints) {
            await tx.sprint.create({
              data: {
                id: s.id,
                workspaceId: s.workspaceId,
                name: s.name,
                goal: s.goal || null,
                status: s.status,
                startsAt: parseDate(s.startsAt),
                endsAt: parseDate(s.endsAt),
                completedAt: parseDate(s.completedAt),
                createdAt: parseRequiredDate(s.createdAt),
                updatedAt: parseRequiredDate(s.updatedAt),
              },
            });
          }
        }

        // 7. Projects
        if (backupData.projects && backupData.projects.length > 0) {
          for (const p of backupData.projects) {
            await tx.project.create({
              data: {
                id: p.id,
                workspaceId: p.workspaceId,
                name: p.name,
                key: p.key || null,
                description: p.description || null,
                color: p.color || null,
                icon: p.icon || null,
                createdAt: parseRequiredDate(p.createdAt),
                updatedAt: parseRequiredDate(p.updatedAt),
              },
            });
          }
        }

        // 8. Project Seniors
        if (backupData.projectSeniors && backupData.projectSeniors.length > 0) {
          for (const ps of backupData.projectSeniors) {
            await tx.projectSenior.create({
              data: {
                projectId: ps.projectId,
                userId: ps.userId,
                assignedAt: parseRequiredDate(ps.assignedAt),
              },
            });
          }
        }

        // 9. Tasks
        if (backupData.tasks && backupData.tasks.length > 0) {
          for (const t of backupData.tasks) {
            await tx.task.create({
              data: {
                id: t.id,
                workspaceId: t.workspaceId,
                title: t.title,
                description: t.description || null,
                type: t.type || 'TASK',
                priority: t.priority || 'MEDIUM',
                estimateValue: t.estimateValue ?? null,
                estimateUnit: t.estimateUnit ?? null,
                position: t.position ?? 0,
                columnId: t.columnId,
                sprintId: t.sprintId || null,
                createdById: t.createdById,
                createdAt: parseRequiredDate(t.createdAt),
                updatedAt: parseRequiredDate(t.updatedAt),
              },
            });
          }
        }

        // 10. Task Projects
        if (backupData.taskProjects && backupData.taskProjects.length > 0) {
          for (const tp of backupData.taskProjects) {
            await tx.taskProject.create({
              data: {
                taskId: tp.taskId,
                projectId: tp.projectId,
                assignedAt: parseRequiredDate(tp.assignedAt),
              },
            });
          }
        }

        // 11. Task Assignments
        if (backupData.taskAssignments && backupData.taskAssignments.length > 0) {
          for (const ta of backupData.taskAssignments) {
            await tx.taskAssignment.create({
              data: {
                taskId: ta.taskId,
                userId: ta.userId,
                assignedAt: parseRequiredDate(ta.assignedAt),
              },
            });
          }
        }

        // 12. Subtasks
        if (backupData.subtasks && backupData.subtasks.length > 0) {
          for (const st of backupData.subtasks) {
            await tx.subtask.create({
              data: {
                id: st.id,
                taskId: st.taskId,
                columnId: st.columnId,
                sprintId: st.sprintId || null,
                title: st.title,
                description: st.description || null,
                priority: st.priority || 'MEDIUM',
                estimateValue: st.estimateValue ?? null,
                estimateUnit: st.estimateUnit ?? null,
                isCompleted: st.isCompleted ?? false,
                position: st.position ?? 0,
                assigneeId: st.assigneeId || null,
                createdById: st.createdById,
                createdAt: parseRequiredDate(st.createdAt),
                updatedAt: parseRequiredDate(st.updatedAt),
              },
            });
          }
        }

        // 13. Attachments
        if (backupData.attachments && backupData.attachments.length > 0) {
          for (const a of backupData.attachments) {
            await tx.attachment.create({
              data: {
                id: a.id,
                ownerType: a.ownerType,
                taskId: a.taskId || null,
                subtaskId: a.subtaskId || null,
                storageKey: a.storageKey,
                originalName: a.originalName,
                mimeType: a.mimeType,
                sizeBytes: BigInt(String(a.sizeBytes ?? '0')),
                checksum: a.checksum,
                uploadedById: a.uploadedById,
                createdAt: parseRequiredDate(a.createdAt),
              },
            });
          }
        }

        // 14. Sprint Snapshots
        if (backupData.sprintTaskSnapshots && backupData.sprintTaskSnapshots.length > 0) {
          for (const snap of backupData.sprintTaskSnapshots) {
            await tx.sprintTaskSnapshot.create({
              data: {
                id: snap.id,
                sprintId: snap.sprintId,
                taskId: snap.taskId || null,
                title: snap.title,
                estimateValue: snap.estimateValue ?? null,
                estimateUnit: snap.estimateUnit ?? null,
                columnName: snap.columnName,
                wasDone: snap.wasDone,
                completedAt: parseRequiredDate(snap.completedAt),
              },
            });
          }
        }

        if (backupData.sprintSubtaskSnapshots && backupData.sprintSubtaskSnapshots.length > 0) {
          for (const snap of backupData.sprintSubtaskSnapshots) {
            await tx.sprintSubtaskSnapshot.create({
              data: {
                id: snap.id,
                sprintId: snap.sprintId,
                subtaskId: snap.subtaskId || null,
                taskId: snap.taskId || null,
                taskTitle: snap.taskTitle,
                title: snap.title,
                estimateValue: snap.estimateValue ?? null,
                estimateUnit: snap.estimateUnit ?? null,
                wasDone: snap.wasDone,
                completedAt: parseRequiredDate(snap.completedAt),
              },
            });
          }
        }

        // 15. Comments
        if (backupData.sprintComments && backupData.sprintComments.length > 0) {
          for (const sc of backupData.sprintComments) {
            await tx.sprintComment.create({
              data: {
                id: sc.id,
                body: sc.body,
                sprintId: sc.sprintId,
                authorId: sc.authorId,
                createdAt: parseRequiredDate(sc.createdAt),
                updatedAt: parseRequiredDate(sc.updatedAt),
              },
            });
          }
        }

        if (backupData.workItemComments && backupData.workItemComments.length > 0) {
          for (const wc of backupData.workItemComments) {
            await tx.workItemComment.create({
              data: {
                id: wc.id,
                body: wc.body,
                taskId: wc.taskId || null,
                subtaskId: wc.subtaskId || null,
                authorId: wc.authorId,
                createdAt: parseRequiredDate(wc.createdAt),
                updatedAt: parseRequiredDate(wc.updatedAt),
              },
            });
          }
        }

        // 16. Activity Events (if present)
        if (backupData.activityEvents && backupData.activityEvents.length > 0) {
          for (const ev of backupData.activityEvents.slice(0, 1000)) {
            await tx.activityEvent.create({
              data: {
                id: ev.id,
                eventType: ev.eventType,
                entityType: ev.entityType,
                entityId: ev.entityId,
                actorId: ev.actorId || null,
                payload: ev.payload,
                createdAt: parseRequiredDate(ev.createdAt),
              },
            });
          }
        }

        // Record restore event
        await tx.activityEvent.create({
          data: {
            eventType: 'backup.restored',
            entityType: 'backup',
            entityId: '00000000-0000-0000-0000-000000000000',
            actorId: restoredActorId,
            payload: {
              initiatedByActorId: actorId,
              restoredAt: new Date().toISOString(),
              counts: {
                users: backupData.users?.length || 0,
                workspaces: backupData.workspaces?.length || 0,
                tasks: backupData.tasks?.length || 0,
                subtasks: backupData.subtasks?.length || 0,
                attachments: backupData.attachments?.length || 0,
              },
            },
          },
        });
      },
      { timeout: 120000 },
    );

    // If transaction succeeded, write extracted attachments to disk
    if (extractedUploads.size > 0) {
      await mkdir(this.uploadDirectory, { recursive: true });
      for (const [key, buffer] of extractedUploads) {
        const dest = resolve(this.uploadDirectory, key);
        try {
          await writeFile(dest, buffer);
        } catch (err) {
          this.logger.warn(`Could not restore file ${key} to disk: ${(err as Error).message}`);
        }
      }
    }

    return {
      success: true,
      message: 'System data restored successfully from backup.',
      restoredAt: new Date().toISOString(),
      counts: {
        users: backupData.users?.length || 0,
        workspaces: backupData.workspaces?.length || 0,
        projects: backupData.projects?.length || 0,
        boardColumns: backupData.boardColumns?.length || 0,
        sprints: backupData.sprints?.length || 0,
        tasks: backupData.tasks?.length || 0,
        subtasks: backupData.subtasks?.length || 0,
        attachments: backupData.attachments?.length || 0,
        comments:
          (backupData.workItemComments?.length || 0) + (backupData.sprintComments?.length || 0),
      },
    };
  }
}
