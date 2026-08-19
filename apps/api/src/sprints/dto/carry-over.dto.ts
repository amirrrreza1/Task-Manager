import { ArrayUnique, IsArray, IsOptional } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class CarryOverDto {
  @IsUuidLike()
  targetSprintId!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUuidLike({ message: 'Each task ID must be a UUID' })
  taskIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUuidLike({ message: 'Each subtask ID must be a UUID' })
  subtaskIds?: string[];
}
