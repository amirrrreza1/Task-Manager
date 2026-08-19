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
  Put,
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
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

const maxAvatarBytes = 2 * 1024 * 1024;
const avatarUpload = FileInterceptor('file', {
  storage: diskStorage({ destination: tmpdir() }),
  limits: { fileSize: maxAvatarBytes, files: 1 },
});

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() viewer: AuthenticatedUser) {
    return this.users.list(viewer.role);
  }

  @Get(':id/avatar')
  async avatar(@Param('id', ParseUUIDPipe) id: string, @Res() response: Response) {
    const file = await this.users.openAvatar(id);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    file.stream.on('error', () => response.destroy()).pipe(response);
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

  @Post(':id/avatar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(avatarUpload)
  uploadAvatar(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.uploadAvatar(id, file, actor.id);
  }

  @Delete(':id/avatar')
  removeAvatar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.removeAvatar(id, actor.id);
  }
}
