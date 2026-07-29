import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MemberReportQueryDto {
  /** Filter to a specific sprint; omit for all-time totals. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sprintId?: string;
}
