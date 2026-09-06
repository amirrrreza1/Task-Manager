import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BoardModule } from '../board/board.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, BoardModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
