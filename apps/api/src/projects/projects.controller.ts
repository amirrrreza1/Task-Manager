import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DemoWritable } from '../auth/decorators/demo-access.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@DemoWritable()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Query() query: ProjectQueryDto) {
    return this.projects.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.projects.get(id);
  }

  @Post()
  create(@Body() input: CreateProjectDto, @CurrentUser() viewer: AuthenticatedUser) {
    return this.projects.create(input, viewer.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() input: UpdateProjectDto,
    @CurrentUser() viewer: AuthenticatedUser,
  ) {
    return this.projects.update(id, input, viewer.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() viewer: AuthenticatedUser) {
    return this.projects.remove(id, viewer.id);
  }
}
