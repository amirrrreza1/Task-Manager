import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { diskStorage } from 'multer';
import { tmpdir } from 'node:os';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { BackupService } from './backup.service';
import { BackupDownloadQueryDto, BackupTelegramDto } from './dto/backup-options.dto';
import type { BackupStatus, RestoreResult } from './backup.types';

const restoreUploadInterceptor = FileInterceptor('file', {
  storage: diskStorage({ destination: tmpdir() }),
  limits: {
    fileSize: (Number(process.env.MAX_BACKUP_SIZE_MB) || 100) * 1024 * 1024,
    files: 1,
  },
});

@ApiTags('backup')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('status')
  getStatus(): Promise<BackupStatus> {
    return this.backupService.getStatus();
  }

  @Get('download')
  async download(
    @Query() query: BackupDownloadQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const backup = await this.backupService.createBackupFile({
      includeAttachments: query.includeAttachments,
      format: query.format,
      actorId: actor.id,
    });

    res.setHeader('Content-Type', backup.mimeType);
    res.setHeader('Content-Length', backup.buffer.length.toString());
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);

    res.send(backup.buffer);
  }

  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  sendToTelegram(@Body() body: BackupTelegramDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.backupService.sendToTelegram(
      { includeAttachments: body.includeAttachments },
      actor.id,
    );
  }

  @Post('restore')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(restoreUploadInterceptor)
  @HttpCode(HttpStatus.OK)
  restore(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RestoreResult> {
    return this.backupService.restoreBackup(file!, actor.id);
  }
}
