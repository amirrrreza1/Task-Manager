import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CommentDto } from './dto/comment.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { MoveSubtaskDto } from './dto/move-subtask.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { ReorderSubtasksDto } from './dto/reorder-subtasks.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}
  @Get() list(@Query() query: TaskQueryDto) {
    return this.tasks.list(query);
  }
  @Post() create(@Body() input: CreateTaskDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.tasks.create(input, actor.id);
  }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.get(id);
  }
  @Get(':taskId/subtasks/:id') getSubtask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.getSubtask(taskId, id);
  }
  @Patch(':id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.update(id, input, actor.id);
  }
  @Post(':id/move') move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: MoveTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.move(id, input, actor.id);
  }
  @Delete(':id') @HttpCode(204) remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.remove(id, actor.id);
  }

  @Post(':id/comments') commentOnTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CommentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.commentOnTask(id, input, actor.id);
  }
  @Patch(':id/comments/:commentId') updateTaskComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() input: CommentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.updateTaskComment(id, commentId, input, actor);
  }
  @Delete(':id/comments/:commentId') @HttpCode(204) removeTaskComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.removeTaskComment(id, commentId, actor);
  }

  @Post(':taskId/subtasks') createSubtask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() input: CreateSubtaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.createSubtask(taskId, input, actor.id);
  }
  @Patch(':taskId/subtasks/:id') updateSubtask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateSubtaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.updateSubtask(taskId, id, input, actor.id);
  }
  @Post(':taskId/subtasks/:id/move') moveSubtask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: MoveSubtaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.moveSubtask(taskId, id, input, actor.id);
  }
  @Post(':taskId/subtasks/reorder') reorderSubtasks(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() input: ReorderSubtasksDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.reorderSubtasks(taskId, input, actor.id);
  }
  @Delete(':taskId/subtasks/:id') @HttpCode(204) removeSubtask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.removeSubtask(taskId, id, actor.id);
  }

  @Post(':taskId/subtasks/:id/comments') commentOnSubtask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CommentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.commentOnSubtask(taskId, id, input, actor.id);
  }
  @Patch(':taskId/subtasks/:id/comments/:commentId') updateSubtaskComment(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() input: CommentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.updateSubtaskComment(taskId, id, commentId, input, actor);
  }
  @Delete(':taskId/subtasks/:id/comments/:commentId') @HttpCode(204) removeSubtaskComment(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.removeSubtaskComment(taskId, id, commentId, actor);
  }
}
