import { IsDateString } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class MoveSubtaskDto {
  @IsUuidLike()
  columnId!: string;

  @IsDateString()
  expectedUpdatedAt!: string;
}
