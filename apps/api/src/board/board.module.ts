import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BoardController } from './board.controller';
import { BoardEventsService } from './board-events.service';
import { BoardGateway } from './board.gateway';
import { BoardService } from './board.service';

@Module({
  imports: [AuthModule],
  controllers: [BoardController],
  providers: [BoardService, BoardGateway, BoardEventsService],
  exports: [BoardService, BoardGateway, BoardEventsService],
})
export class BoardModule {}
