import { Module } from '@nestjs/common';
import {
  AttachmentsController,
  SubtaskAttachmentsController,
  TaskAttachmentsController,
} from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  controllers: [AttachmentsController, TaskAttachmentsController, SubtaskAttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}
