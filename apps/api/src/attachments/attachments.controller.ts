import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { tmpdir } from 'node:os';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DemoRestricted } from '../auth/decorators/demo-access.decorator';
import { AttachmentsService } from './attachments.service';

const maxBytes = (Number(process.env.MAX_UPLOAD_SIZE_MB) || 25) * 1024 * 1024;
const upload = FileInterceptor('file', {
  storage: diskStorage({ destination: tmpdir() }),
  limits: { fileSize: maxBytes, files: 1 },
});

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('tasks/:id/attachments')
export class TaskAttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(upload)
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachments.uploadToTask(id, file, actor.id);
  }
}

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('subtasks/:id/attachments')
export class SubtaskAttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(upload)
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachments.uploadToSubtask(id, file, actor.id);
  }
}

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get(':id')
  @DemoRestricted()
  async download(@Param('id', ParseUUIDPipe) id: string, @Res() response: Response) {
    const attachment = await this.attachments.get(id);
    const inline = new Set([
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'application/pdf',
    ]).has(attachment.mimeType);
    const fallbackName = attachment.originalName.replace(/["\\]/g, '_');
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', attachment.sizeBytes.toString());
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
    );
    this.attachments
      .open(attachment.storageKey)
      .on('error', () => response.destroy())
      .pipe(response);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.attachments.remove(id, actor.id);
  }
}
