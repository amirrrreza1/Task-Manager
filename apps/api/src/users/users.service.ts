import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PasswordService } from '../auth/password.service';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  avatarSeed: true,
  isActive: true,
  isBootstrapAdmin: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

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
    const id = crypto.randomUUID();
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          id,
          username,
          displayName: input.displayName.trim(),
          passwordHash: await this.passwords.hash(input.password),
          avatarSeed: randomBytes(32).toString('hex'),
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

  async update(id: string, input: UpdateUserDto, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found.');
    if (existing.isBootstrapAdmin && (input.username !== undefined || input.isActive === false)) {
      throw new ForbiddenException('The bootstrap administrator is controlled by the environment.');
    }

    const username = input.username?.trim().toLowerCase();
    if (username && username !== existing.username)
      await this.assertUsernameAvailable(username, id);

    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id },
        data: {
          ...(username ? { username } : {}),
          ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
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
          actorId,
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
  }

  async regenerateAvatar(id: string, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found.');
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id },
        data: { avatarSeed: randomBytes(32).toString('hex') },
        select: userSelect,
      });
      await transaction.activityEvent.create({
        data: {
          eventType: 'user.avatar_regenerated',
          entityType: 'user',
          entityId: id,
          actorId,
          payload: { version: 1 },
        },
      });
      return user;
    });
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
}
