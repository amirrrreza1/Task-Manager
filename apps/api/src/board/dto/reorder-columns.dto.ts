import { ArrayMinSize, IsArray } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class ReorderColumnsDto {
  @IsArray()
  @ArrayMinSize(2)
  @IsUuidLike({ each: true, message: 'Each column ID must be a UUID' })
  columnIds!: string[];
}
