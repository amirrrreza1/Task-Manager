import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TokenBucketThrottlerStorageService } from './infrastructure/throttler/token-bucket-throttler-storage.service';
import { AuthModule } from './auth/auth.module';
import { AccessTokenGuard } from './auth/guards/access-token.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { resolveEnvFilePaths } from './infrastructure/config/env-files';
import { validateEnvironment } from './infrastructure/config/environment';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';
import { BoardModule } from './board/board.module';
import { TasksModule } from './tasks/tasks.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { SprintsModule } from './sprints/sprints.module';
import { MailModule } from './infrastructure/mail/mail.module';
import { TelegramModule } from './infrastructure/telegram/telegram.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { ProjectsModule } from './projects/projects.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFilePaths(),
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot({
      storage: new TokenBucketThrottlerStorageService(),
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),
    PrismaModule,
    StorageModule,
    MailModule,
    TelegramModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    ProjectsModule,
    SettingsModule,
    BoardModule,
    TasksModule,
    AttachmentsModule,
    SprintsModule,
    ReportsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
