import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AssignSprintSubtasksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  subtaskIds!: string[];
}
