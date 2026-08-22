import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { pickLeastUsedUserColor } from '../users/user-colors';
import { PasswordService } from './password.service';

@Injectable()
export class BootstrapAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
  ) {}

  async onApplicationBootstrap() {
    const username = this.config.getOrThrow<string>('ADMIN_USERNAME').trim().toLowerCase();
    const password = this.config.getOrThrow<string>('ADMIN_PASSWORD');
    const existingBootstrap = await this.prisma.user.findFirst({
      where: { isBootstrapAdmin: true },
    });
    const usernameOwner = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });

    if (!existingBootstrap) {
      if (usernameOwner) {
        throw new Error(`ADMIN_USERNAME is already owned by a non-bootstrap account: ${username}`);
      }
      const usedColors = await this.prisma.user.findMany({ select: { color: true } });
      await this.prisma.user.create({
        data: {
          username,
          displayName: 'Administrator',
          passwordHash: await this.passwords.hash(password),
          role: 'ADMIN',
          isActive: true,
          isBootstrapAdmin: true,
          color: pickLeastUsedUserColor(usedColors.map((user) => user.color)),
        },
      });
      this.logger.log('Bootstrap administrator created.');
      return;
    }

    if (usernameOwner && usernameOwner.id !== existingBootstrap.id) {
      throw new Error(`ADMIN_USERNAME is already owned by another account: ${username}`);
    }

    const passwordMatches = await this.passwords.verify(existingBootstrap.passwordHash, password);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: existingBootstrap.id },
        data: {
          username,
          role: 'ADMIN',
          isActive: true,
          ...(passwordMatches ? {} : { passwordHash: await this.passwords.hash(password) }),
        },
      });
      if (!passwordMatches) {
        await transaction.refreshSession.updateMany({
          where: { userId: existingBootstrap.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });
    this.logger.log('Bootstrap administrator verified.');
  }
}
