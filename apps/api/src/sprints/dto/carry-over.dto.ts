import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class CarryOverDto {
  @IsUUID()
  targetSprintId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  taskIds!: string[];
}
