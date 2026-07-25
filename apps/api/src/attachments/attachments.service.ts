import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttachmentOwnerType, type Prisma } from '@prisma/client';
import { rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { LocalFileStorage } from '../infrastructure/storage/local-file-storage.service';

interface UploadedFile {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

const attachmentInclude = {
  uploadedBy: { select: { id: true, displayName: true, avatarSeed: true, isActive: true } },
} satisfies Prisma.AttachmentInclude;

@Injectable()
export class AttachmentsService {
  private readonly maximumBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalFileStorage,
    config: ConfigService,
  ) {
    this.maximumBytes = config.get<number>('MAX_UPLOAD_SIZE_MB', 25) * 1024 * 1024;
  }

  uploadToTask(taskId: string, file: UploadedFile | undefined, actorId: string) {
    return this.upload(AttachmentOwnerType.TASK, taskId, file, actorId);
  }

  uploadToSubtask(subtaskId: string, file: UploadedFile | undefined, actorId: string) {
    return this.upload(AttachmentOwnerType.SUBTASK, subtaskId, file, actorId);
  }

  async get(id: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: attachmentInclude,
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');
    return attachment;
  }

  async remove(id: string, actorId: string) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id } });
    if (!attachment) throw new NotFoundException('Attachment not found.');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.attachment.delete({ where: { id } });
      await transaction.activityEvent.create({
        data: {
          eventType: 'attachment.deleted',
          entityType: 'attachment',
          entityId: id,
          actorId,
          payload: {
            version: 1,
            ownerType: attachment.ownerType,
            taskId: attachment.taskId,
            subtaskId: attachment.subtaskId,
            originalName: attachment.originalName,
          },
        },
      });
    });
    await this.storage.delete(attachment.storageKey);
  }

  open(storageKey: string) {
    return this.storage.open(storageKey);
  }

  serialize<T extends { sizeBytes: bigint; storageKey: string; uploadedById: string }>(
    attachment: T,
  ) {
    const safe = Object.fromEntries(
      Object.entries(attachment).filter(([key]) => key !== 'storageKey' && key !== 'uploadedById'),
    );
    return { ...safe, sizeBytes: Number(attachment.sizeBytes) };
  }

  private async upload(
    ownerType: AttachmentOwnerType,
    ownerId: string,
    file: UploadedFile | undefined,
    actorId: string,
  ) {
    if (!file) throw new BadRequestException('Choose a file to upload.');
    try {
      if (file.size < 1) throw new BadRequestException('Empty files cannot be attached.');
      if (file.size > this.maximumBytes)
        throw new PayloadTooLargeException('The file exceeds the configured upload limit.');
      const ownerExists =
        ownerType === AttachmentOwnerType.TASK
          ? await this.prisma.task.findUnique({ where: { id: ownerId }, select: { id: true } })
          : await this.prisma.subtask.findUnique({ where: { id: ownerId }, select: { id: true } });
      if (!ownerExists)
        throw new NotFoundException(
          ownerType === AttachmentOwnerType.TASK ? 'Task not found.' : 'Subtask not found.',
        );
      const originalName = [...basename(file.originalname)]
        .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
        .join('')
        .trim()
        .slice(0, 255);
      if (!originalName) throw new BadRequestException('The filename is invalid.');
      const stored = await this.storage.put(file.path);
      try {
        const attachment = await this.prisma.$transaction(async (transaction) => {
          const created = await transaction.attachment.create({
            data: {
              ownerType,
              ...(ownerType === AttachmentOwnerType.TASK
                ? { taskId: ownerId }
                : { subtaskId: ownerId }),
              uploadedById: actorId,
              storageKey: stored.storageKey,
              originalName,
              mimeType: (file.mimetype || 'application/octet-stream').slice(0, 127),
              sizeBytes: file.size,
              checksum: stored.checksum,
            },
            include: attachmentInclude,
          });
          await transaction.activityEvent.create({
            data: {
              eventType: 'attachment.created',
              entityType: 'attachment',
              entityId: created.id,
              actorId,
              payload: {
                version: 1,
                ownerType,
                ownerId,
                originalName,
                sizeBytes: file.size,
                checksum: stored.checksum,
              },
            },
          });
          return created;
        });
        return this.serialize(attachment);
      } catch (error) {
        await this.storage.delete(stored.storageKey);
        throw error;
      }
    } finally {
      if (file) await rm(file.path, { force: true });
    }
  }
}
