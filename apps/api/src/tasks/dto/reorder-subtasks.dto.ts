import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReorderSubtasksDto {
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('4', { each: true }) subtaskIds!: string[];
}
