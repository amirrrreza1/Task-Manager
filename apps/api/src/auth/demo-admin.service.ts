import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { pickLeastUsedUserColor } from '../users/user-colors';
import { PasswordService } from './password.service';

@Injectable()
export class DemoAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
  ) {}

  async onApplicationBootstrap() {
    const enabled = this.config.get<string>('DEMO_MODE', 'false') === 'true';
    const existingDemo = await this.prisma.user.findFirst({ where: { isDemoAccount: true } });

    if (!enabled) {
      if (existingDemo?.isActive) {
        await this.prisma.$transaction([
          this.prisma.user.update({
            where: { id: existingDemo.id },
            data: { isActive: false },
          }),
          this.prisma.refreshSession.updateMany({
            where: { userId: existingDemo.id, revokedAt: null },
            data: { revokedAt: new Date() },
          }),
        ]);
        this.logger.log('Restricted demo administrator disabled.');
      }
      return;
    }

    const username = this.config
      .get<string>('DEMO_ADMIN_USERNAME', 'demo-admin')
      .trim()
      .toLowerCase();
    const usernameOwner = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });

    if (usernameOwner && usernameOwner.id !== existingDemo?.id) {
      throw new Error(`DEMO_ADMIN_USERNAME is already owned by another account: ${username}`);
    }

    if (!existingDemo) {
      const usedColors = await this.prisma.user.findMany({ select: { color: true } });
      await this.prisma.user.create({
        data: {
          username,
          displayName: 'Demo Administrator',
          passwordHash: await this.passwords.hash(randomBytes(48).toString('base64url')),
          role: 'ADMIN',
          isActive: true,
          isDemoAccount: true,
          color: pickLeastUsedUserColor(usedColors.map((user) => user.color)),
        },
      });
      this.logger.log('Restricted demo administrator created.');
      return;
    }

    await this.prisma.user.update({
      where: { id: existingDemo.id },
      data: { username, role: 'ADMIN', isActive: true, isDemoAccount: true },
    });
    this.logger.log('Restricted demo administrator verified.');
  }
}
