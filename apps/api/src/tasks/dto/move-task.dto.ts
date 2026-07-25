import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class MoveTaskDto {
  @IsUUID()
  columnId!: string;

  @IsOptional()
  @IsUUID()
  beforeTaskId?: string;

  @IsOptional()
  @IsUUID()
  afterTaskId?: string;

  @IsDateString()
  expectedUpdatedAt!: string;
}
