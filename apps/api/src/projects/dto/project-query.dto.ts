import { Transform } from 'class-transformer';
import { IsOptional, ValidateIf } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class ProjectQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value !== 'undefined' &&
    value !== 'null'
      ? value.trim()
      : undefined,
  )
  @ValidateIf(
    (o) =>
      typeof o.workspaceId === 'string' &&
      o.workspaceId.length > 0 &&
      o.workspaceId !== 'undefined' &&
      o.workspaceId !== 'null',
  )
  @IsUuidLike()
  workspaceId?: string;
}
