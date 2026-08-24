import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, UserRole } from '@prisma/client';
import { rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { PasswordService } from '../auth/password.service';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { LocalFileStorage } from '../infrastructure/storage/local-file-storage.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { pickLeastUsedUserColor } from './user-colors';

interface UploadedFile {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

const AVATAR_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

import { NotificationsService } from '../notifications/notifications.service';

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  color: true,
  email: true,
  telegramUsername: true,
  role: true,
  hasAvatar: true,
  isActive: true,
  isBootstrapAdmin: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  private readonly maximumAvatarBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly storage: LocalFileStorage,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.maximumAvatarBytes = Math.min(
      (config.get<number>('MAX_UPLOAD_SIZE_MB', 25) * 1024 * 1024) / 5,
      2 * 1024 * 1024,
    );
  }

  list(viewerRole: UserRole) {
    return this.prisma.user.findMany({
      where: viewerRole === 'ADMIN' ? {} : { isActive: true },
      orderBy: [{ isBootstrapAdmin: 'desc' }, { displayName: 'asc' }],
      select: userSelect,
    });
  }

  async get(id: string, viewerRole: UserRole) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user || (!user.isActive && viewerRole !== 'ADMIN'))
      throw new NotFoundException('User not found.');
    return user;
  }

  async create(input: CreateUserDto, actorId: string) {
    const username = input.username.trim().toLowerCase();
    await this.assertUsernameAvailable(username);

    const email = input.email?.trim().toLowerCase() || null;
    if (email) {
      await this.assertEmailAvailable(email);
    }

    const telegramUsername = input.telegramUsername?.trim().replace(/^@+/, '') || null;
    const usedColors = await this.prisma.user.findMany({ select: { color: true } });
    const color = pickLeastUsedUserColor(
      usedColors.map((user) => user.color),
      input.color,
    );

    const id = crypto.randomUUID();
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          id,
          username,
          displayName: input.displayName.trim(),
          email,
          telegramUsername,
          color,
          passwordHash: await this.passwords.hash(input.password),
        },
        select: userSelect,
      });
      await transaction.activityEvent.create({
        data: {
          eventType: 'user.created',
          entityType: 'user',
          entityId: user.id,
          actorId,
          payload: { version: 1, username: user.username },
        },
      });
      return user;
    });
  }

  async update(id: string, input: UpdateUserDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found.');

    const isSelf = actor.id === id;
    const isAdmin = actor.role === 'ADMIN';

    if (!isAdmin && !isSelf) {
      throw new ForbiddenException('You can only update your own profile.');
    }

    if (!isAdmin) {
      if (
        input.isActive !== undefined ||
        input.role !== undefined ||
        input.username !== undefined
      ) {
        throw new ForbiddenException('Only administrators can change role, status, or username.');
      }
    }

    if (
      existing.isBootstrapAdmin &&
      (input.username !== undefined || input.isActive === false || input.role !== undefined)
    ) {
      throw new ForbiddenException('The bootstrap administrator is controlled by the environment.');
    }

    const username = input.username?.trim().toLowerCase();
    if (username && username !== existing.username)
      await this.assertUsernameAvailable(username, id);

    const email = input.email !== undefined ? input.email?.trim().toLowerCase() || null : undefined;
    if (email && email !== existing.email) {
      await this.assertEmailAvailable(email, id);
    }

    const telegramUsername =
      input.telegramUsername !== undefined
        ? input.telegramUsername?.trim().replace(/^@+/, '') || null
        : undefined;

    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id },
        data: {
          ...(username ? { username } : {}),
          ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(telegramUsername !== undefined ? { telegramUsername } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
        },
        select: userSelect,
      });
      if (input.isActive === false) {
        await transaction.refreshSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await transaction.activityEvent.create({
        data: {
          eventType: 'user.updated',
          entityType: 'user',
          entityId: id,
          actorId: actor.id,
          payload: {
            version: 1,
            fields: Object.keys(input).filter((key) => key !== 'password'),
          },
        },
      });
      return user;
    });
  }

  async resetPassword(id: string, password: string, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found.');
    if (existing.isBootstrapAdmin) {
      throw new ForbiddenException(
        'Change the bootstrap administrator password in the environment.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash: await this.passwords.hash(password) },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.activityEvent.create({
        data: {
          eventType: 'user.password_reset',
          entityType: 'user',
          entityId: id,
          actorId,
          payload: { version: 1 },
        },
      }),
    ]);

    // Dispatch security notification
    void this.notifications.dispatch({
      recipientUserIds: [id],
      actorId,
      type: 'user.password_reset',
      title: '🔐 Password Reset by Administrator',
      message: 'Your Task Manager password was reset by an administrator.',
      lines: [
        'Your password has been updated by an administrator.',
        'If you did not request this change, please contact your workspace administrator immediately.',
      ],
    });
  }

  async uploadAvatar(id: string, file: UploadedFile | undefined, actor: AuthenticatedUser) {
    if (actor.role !== 'ADMIN' && actor.id !== id) {
      throw new ForbiddenException('You do not have permission to change this avatar.');
    }
    if (!file) throw new BadRequestException('Choose an image to upload.');

    try {
      if (file.size < 1) throw new BadRequestException('Empty files cannot be used as avatars.');
      if (file.size > this.maximumAvatarBytes) {
        throw new PayloadTooLargeException('Avatars must be 2 MB or smaller.');
      }
      const mimeType = (file.mimetype || '').toLowerCase();
      if (!AVATAR_MIME_TYPES.has(mimeType)) {
        throw new BadRequestException('Avatars must be a PNG, JPEG, GIF, or WebP image.');
      }
      const existing = await this.prisma.user.findUnique({ where: { id } });
      if (!existing || !existing.isActive) throw new NotFoundException('User not found.');

      const originalName = [...basename(file.originalname)]
        .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
        .join('')
        .trim()
        .slice(0, 255);
      if (!originalName) throw new BadRequestException('The filename is invalid.');

      const stored = await this.storage.put(file.path);
      const previousKey = existing.avatarStorageKey;
      try {
        const user = await this.prisma.$transaction(async (transaction) => {
          const updated = await transaction.user.update({
            where: { id },
            data: {
              avatarStorageKey: stored.storageKey,
              avatarMimeType: mimeType.slice(0, 127),
              hasAvatar: true,
            },
            select: userSelect,
          });
          await transaction.activityEvent.create({
            data: {
              eventType: 'user.avatar_uploaded',
              entityType: 'user',
              entityId: id,
              actorId: actor.id,
              payload: { version: 1, mimeType, sizeBytes: file.size },
            },
          });
          return updated;
        });
        if (previousKey) await this.storage.delete(previousKey);
        return user;
      } catch (error) {
        await this.storage.delete(stored.storageKey);
        throw error;
      }
    } finally {
      if (file) await rm(file.path, { force: true });
    }
  }

  async removeAvatar(id: string, actor: AuthenticatedUser) {
    if (actor.role !== 'ADMIN' && actor.id !== id) {
      throw new ForbiddenException('You do not have permission to change this avatar.');
    }
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found.');
    if (!existing.hasAvatar || !existing.avatarStorageKey) {
      return this.prisma.user.findUniqueOrThrow({ where: { id }, select: userSelect });
    }
    const previousKey = existing.avatarStorageKey;
    const user = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id },
        data: {
          avatarStorageKey: null,
          avatarMimeType: null,
          hasAvatar: false,
        },
        select: userSelect,
      });
      await transaction.activityEvent.create({
        data: {
          eventType: 'user.avatar_removed',
          entityType: 'user',
          entityId: id,
          actorId: actor.id,
          payload: { version: 1 },
        },
      });
      return updated;
    });
    await this.storage.delete(previousKey);
    return user;
  }

  async openAvatar(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        isActive: true,
        hasAvatar: true,
        avatarStorageKey: true,
        avatarMimeType: true,
      },
    });
    if (!user?.isActive || !user.hasAvatar || !user.avatarStorageKey || !user.avatarMimeType) {
      throw new NotFoundException('Avatar not found.');
    }
    return {
      mimeType: user.avatarMimeType,
      stream: this.storage.open(user.avatarStorageKey),
    };
  }

  private async assertUsernameAvailable(username: string, excludedId?: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
    });
    if (existing) throw new ConflictException('That username is already in use.');
  }

  private async assertEmailAvailable(email: string, excludedId?: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
    });
    if (existing) throw new ConflictException('That email address is already in use.');
  }
}
