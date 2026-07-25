import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() viewer: AuthenticatedUser) {
    return this.users.list(viewer.role);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() viewer: AuthenticatedUser) {
    return this.users.get(id, viewer.role);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() input: CreateUserDto, @CurrentUser() viewer: AuthenticatedUser) {
    return this.users.create(input, viewer.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateUserDto,
    @CurrentUser() viewer: AuthenticatedUser,
  ) {
    return this.users.update(id, input, viewer.id);
  }

  @Put(':id/password')
  @HttpCode(204)
  @Roles(UserRole.ADMIN)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ResetPasswordDto,
    @CurrentUser() viewer: AuthenticatedUser,
  ) {
    return this.users.resetPassword(id, input.password, viewer.id);
  }

  @Post(':id/avatar/regenerate')
  @Roles(UserRole.ADMIN)
  regenerateAvatar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() viewer: AuthenticatedUser,
  ) {
    return this.users.regenerateAvatar(id, viewer.id);
  }
}
