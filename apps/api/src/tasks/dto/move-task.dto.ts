import { IsDateString, IsOptional, ValidateIf } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class MoveTaskDto {
  @IsUuidLike()
  columnId!: string;

  @IsOptional()
  @ValidateIf((o) => typeof o.beforeTaskId === 'string' && o.beforeTaskId.length > 0)
  @IsUuidLike()
  beforeTaskId?: string;

  @IsOptional()
  @ValidateIf((o) => typeof o.afterTaskId === 'string' && o.afterTaskId.length > 0)
  @IsUuidLike()
  afterTaskId?: string;

  @IsDateString()
  expectedUpdatedAt!: string;
}
