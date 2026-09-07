import { TaskPriority, TaskType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

const toBoolean = ({ value }: { value: unknown }) => value === 'true' || value === true;
const toOptionalString = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim().length > 0 && value !== 'undefined' && value !== 'null'
    ? value.trim()
    : undefined;

export class BoardQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  search?: string;

  @IsOptional()
  @Transform(toOptionalString)
  @ValidateIf((o) => typeof o.assigneeId === 'string' && o.assigneeId.length > 0)
  @IsUuidLike()
  assigneeId?: string;

  @IsOptional()
  @Transform(toOptionalString)
  @ValidateIf((o) => typeof o.sprintId === 'string' && o.sprintId.length > 0)
  @IsUuidLike()
  sprintId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unassigned?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasEstimate?: boolean;

  @IsOptional()
  @Transform(toOptionalString)
  @IsEnum(TaskType)
  type?: TaskType;

  @IsOptional()
  @Transform(toOptionalString)
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @Transform(toOptionalString)
  @ValidateIf((o) => typeof o.workspaceId === 'string' && o.workspaceId.length > 0)
  @IsUuidLike()
  workspaceId?: string;

  @IsOptional()
  @Transform(toOptionalString)
  @ValidateIf((o) => typeof o.projectId === 'string' && o.projectId.length > 0)
  @IsUuidLike()
  projectId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  excludeBacklog?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  backlogOnly?: boolean;
}
