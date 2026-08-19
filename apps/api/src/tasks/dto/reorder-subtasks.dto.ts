import { ArrayMinSize, ArrayUnique, IsArray } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class ReorderSubtasksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUuidLike({ message: 'Each subtask ID must be a UUID' })
  subtaskIds!: string[];
}
