import { ArrayMinSize, ArrayUnique, IsArray } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class AssignSprintSubtasksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUuidLike({ each: true, message: 'Each subtask ID must be a UUID' })
  subtaskIds!: string[];
}
