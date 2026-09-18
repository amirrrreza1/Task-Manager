import { IsOptional, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class MemberReportQueryDto {
  /** Filter to one sprint; completed sprints are reconstructed from finish snapshots. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined,
  )
  @ValidateIf((o) => typeof o.sprintId === 'string' && o.sprintId.length > 0)
  @IsUuidLike()
  sprintId?: string;
}
