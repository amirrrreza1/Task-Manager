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
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DemoWritable } from '../auth/decorators/demo-access.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CarryOverDto } from './dto/carry-over.dto';
import { ResolveSprintWorkDto } from './dto/resolve-sprint-work.dto';
import { AssignSprintTasksDto } from './dto/assign-sprint-tasks.dto';
import { AssignSprintSubtasksDto } from './dto/assign-sprint-subtasks.dto';
import { CommentDto } from './dto/comment.dto';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { FinishSprintDto } from './dto/finish-sprint.dto';
import { SprintQueryDto } from './dto/sprint-query.dto';
import { StartSprintDto } from './dto/start-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { SprintsService } from './sprints.service';

@ApiTags('sprints')
@ApiBearerAuth()
@DemoWritable()
@Controller('sprints')
export class SprintsController {
  constructor(private readonly sprints: SprintsService) {}

  @Get()
  list(@Query() query: SprintQueryDto) {
    return this.sprints.list(query);
  }

  @Post()
  create(@Body() input: CreateSprintDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.sprints.create(input, actor.id);
  }

  @Get('history')
  history(@Query('workspaceId') workspaceId?: string) {
    return this.sprints.history(workspaceId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.sprints.get(id);
  }

  @Get(':id/available-tasks')
  availableTasks(@Param('id', ParseUUIDPipe) id: string) {
    return this.sprints.availableTasks(id);
  }

  @Get(':id/available-subtasks')
  availableSubtasks(@Param('id', ParseUUIDPipe) id: string) {
    return this.sprints.availableSubtasks(id);
  }

  @Post(':id/tasks')
  assignTasks(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AssignSprintTasksDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sprints.assignTasks(id, input, actor.id);
  }

  @Post(':id/subtasks')
  assignSubtasks(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AssignSprintSubtasksDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sprints.assignSubtasks(id, input, actor.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateSprintDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sprints.update(id, input, actor);
  }

  @Post(':id/start')
  @Roles(UserRole.ADMIN)
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: StartSprintDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sprints.start(id, input, actor.id);
  }

  @Post(':id/finish')
  @Roles(UserRole.ADMIN)
  finish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: FinishSprintDto = {},
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sprints.finish(id, actor.id, input);
  }

  @Post(':id/move-to-backlog')
  @Roles(UserRole.ADMIN)
  moveToBacklog(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ResolveSprintWorkDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sprints.moveToBacklog(id, input, actor.id);
  }

  @Post(':id/carry-over')
  @Roles(UserRole.ADMIN)
  carryOver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CarryOverDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sprints.carryOver(id, input, actor.id);
  }

  @Get(':id/comments')
  comments(@Param('id', ParseUUIDPipe) id: string, @Query() query: SprintQueryDto) {
    return this.sprints.comments(id, query);
  }

  @Post(':id/comments')
  comment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CommentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sprints.comment(id, input, actor.id);
  }

  @Patch(':id/comments/:commentId')
  updateComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() input: CommentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sprints.updateComment(id, commentId, input, actor);
  }

  @Delete(':id/comments/:commentId')
  @HttpCode(204)
  removeComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sprints.removeComment(id, commentId, actor);
  }
}
