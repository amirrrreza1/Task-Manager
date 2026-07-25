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
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { BoardService } from './board.service';
import { BoardQueryDto } from './dto/board-query.dto';
import { CreateColumnDto } from './dto/create-column.dto';
import { ReorderColumnsDto } from './dto/reorder-columns.dto';
import { UpdateColumnDto } from './dto/update-column.dto';

@ApiTags('board')
@ApiBearerAuth()
@Controller()
export class BoardController {
  constructor(private readonly board: BoardService) {}

  @Get('board')
  read(@Query() query: BoardQueryDto) {
    return this.board.read(query);
  }

  @Get('board-columns')
  columns() {
    return this.board.listColumns();
  }

  @Post('board-columns')
  @Roles(UserRole.ADMIN)
  create(@Body() input: CreateColumnDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.board.create(input, actor);
  }

  @Patch('board-columns/:id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateColumnDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.board.update(id, input, actor);
  }

  @Post('board-columns/reorder')
  @Roles(UserRole.ADMIN)
  reorder(@Body() input: ReorderColumnsDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.board.reorder(input, actor);
  }

  @Delete('board-columns/:id')
  @HttpCode(204)
  @Roles(UserRole.ADMIN)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('moveTasksTo') moveTasksTo: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.board.remove(id, moveTasksTo, actor);
  }
}
