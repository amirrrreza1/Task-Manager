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
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { CreateTaskDto } from './dto/create-task.dto';
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
}
