import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class FinishSprintDto {
  @ApiPropertyOptional({
    description: 'Optional target planned sprint ID to receive unfinished work',
  })
  @IsOptional()
  @IsUUID()
  targetSprintId?: string;
}
