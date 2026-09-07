import { TaskPriority, TaskType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

const toBoolean = ({ value }: { value: unknown }) => value === 'true' || value === true;
const toOptionalString = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim().length > 0 && value !== 'undefined' && value !== 'null'
    ? value.trim()
    : undefined;

export class TaskQueryDto {
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
  @IsString()
  @MaxLength(240)
  search?: string;

  @IsOptional()
  @Transform(toOptionalString)
  @ValidateIf((o) => typeof o.columnId === 'string' && o.columnId.length > 0)
  @IsUuidLike()
  columnId?: string;

  @IsOptional()
  @Transform(toOptionalString)
  @ValidateIf((o) => typeof o.sprintId === 'string' && o.sprintId.length > 0)
  @IsUuidLike()
  sprintId?: string;

  @IsOptional()
  @Transform(toOptionalString)
  @ValidateIf((o) => typeof o.assigneeId === 'string' && o.assigneeId.length > 0)
  @IsUuidLike()
  assigneeId?: string;

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
  @ValidateIf((o) => typeof o.cursor === 'string' && o.cursor.length > 0)
  @IsUuidLike()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
