import { ArrayMinSize, ArrayUnique, IsArray } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class AssignSprintTasksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUuidLike({ each: true, message: 'Each task ID must be a UUID' })
  taskIds!: string[];
}
