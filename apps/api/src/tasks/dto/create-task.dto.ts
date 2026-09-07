import { TaskPriority, TaskType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EstimateDto } from '../../common/dto/estimate.dto';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class CreateTaskDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined,
  )
  @ValidateIf((o) => typeof o.workspaceId === 'string' && o.workspaceId.length > 0)
  @IsUuidLike()
  workspaceId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined,
  )
  @ValidateIf((o) => typeof o.columnId === 'string' && o.columnId.length > 0)
  @IsUuidLike()
  columnId?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null,
  )
  @ValidateIf((o) => typeof o.sprintId === 'string' && o.sprintId.length > 0)
  @IsUuidLike()
  sprintId?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null,
  )
  @ValidateIf((o) => typeof o.projectId === 'string' && o.projectId.length > 0)
  @IsUuidLike()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUuidLike({ each: true, message: 'Each project ID must be a UUID' })
  projectIds?: string[];

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @ValidateNested()
  @Type(() => EstimateDto)
  estimate?: EstimateDto | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUuidLike({ each: true, message: 'Each assignee ID must be a UUID' })
  assigneeIds?: string[];
}
