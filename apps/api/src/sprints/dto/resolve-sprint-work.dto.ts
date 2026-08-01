import { ArrayUnique, IsArray, IsOptional, IsUUID } from 'class-validator';

export class ResolveSprintWorkDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  taskIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  subtaskIds?: string[];
}
