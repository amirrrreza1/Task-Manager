import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Prisma, User } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { AuthenticatedUser } from './auth.types';
import { PasswordService } from './password.service';

const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  color: true,
  email: true,
  telegramUsername: true,
  role: true,
  hasAvatar: true,
  isBootstrapAdmin: true,
} satisfies Prisma.UserSelect;

const REFRESH_GRACE_PERIOD_MS = 30_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
  ) {}

  async login(usernameInput: string, password: string) {
    const username = usernameInput.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
    const passwordMatches = await this.passwords.verifyForLogin(user?.passwordHash, password);

    if (!user || !passwordMatches || !user.isActive) {
      throw new UnauthorizedException('The username or password is incorrect.');
    }

    return this.createSession(user);
  }

  async refresh(rawToken: string | undefined): Promise<{
    accessToken: string;
    refreshToken?: string;
    user: AuthenticatedUser;
  }> {
    if (!rawToken) throw new UnauthorizedException('A refresh session is required.');
    const tokenHash = this.hashToken(rawToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) throw new UnauthorizedException('The refresh session is invalid.');

    if (session.revokedAt) {
      const timeSinceRevocation = Date.now() - session.revokedAt.getTime();
      if (timeSinceRevocation <= REFRESH_GRACE_PERIOD_MS) {
        const activeSession = await this.prisma.refreshSession.findFirst({
          where: {
            familyId: session.familyId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
          include: { user: true },
        });

        if (activeSession && activeSession.user.isActive) {
          return {
            accessToken: await this.signAccessToken(activeSession.user),
            refreshToken: undefined,
            user: this.toPublicUser(activeSession.user),
          };
        }
      }

      await this.prisma.refreshSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse was detected. Please sign in again.');
    }

    if (session.expiresAt <= new Date() || !session.user.isActive) {
      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException('The refresh session has expired.');
    }

    const nextRawToken = this.newRefreshToken();
    const now = new Date();
    const updated = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (claimed.count !== 1) return false;
      await transaction.refreshSession.create({
        data: {
          tokenHash: this.hashToken(nextRawToken),
          familyId: session.familyId,
          userId: session.userId,
          expiresAt: this.refreshExpiry(),
        },
      });
      return true;
    });

    if (!updated) {
      const activeSession = await this.prisma.refreshSession.findFirst({
        where: {
          familyId: session.familyId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
        include: { user: true },
      });

      if (activeSession && activeSession.user.isActive) {
        return {
          accessToken: await this.signAccessToken(activeSession.user),
          refreshToken: undefined,
          user: this.toPublicUser(activeSession.user),
        };
      }

      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException('The refresh session has already been used.');
    }

    return {
      accessToken: await this.signAccessToken(session.user),
      refreshToken: nextRawToken,
      user: this.toPublicUser(session.user),
    };
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException('The current password is incorrect.');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await this.passwords.hash(newPassword) },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.activityEvent.create({
        data: {
          eventType: 'user.password_changed',
          entityType: 'user',
          entityId: userId,
          actorId: userId,
          payload: { version: 1 },
        },
      }),
    ]);
  }

  private async createSession(user: User) {
    const refreshToken = this.newRefreshToken();
    await this.prisma.refreshSession.create({
      data: {
        tokenHash: this.hashToken(refreshToken),
        familyId: randomUUID(),
        userId: user.id,
        expiresAt: this.refreshExpiry(),
      },
    });
    return {
      accessToken: await this.signAccessToken(user),
      refreshToken,
      user: this.toPublicUser(user),
    };
  }

  private signAccessToken(user: User) {
    return this.jwt.signAsync(
      { sub: user.id, username: user.username, role: user.role },
      { expiresIn: this.config.getOrThrow<string>('JWT_EXPIRES_IN') as never },
    );
  }

  private newRefreshToken() {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshExpiry() {
    const days = this.config.get<number>('REFRESH_TOKEN_DAYS', 7);
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private async revokeFamily(familyId: string) {
    await this.prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private toPublicUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      color: user.color,
      role: user.role,
      hasAvatar: user.hasAvatar,
      isBootstrapAdmin: user.isBootstrapAdmin,
    };
  }
}

export { publicUserSelect };
