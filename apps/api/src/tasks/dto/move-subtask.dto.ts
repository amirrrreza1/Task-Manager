import { IsDateString, IsUUID } from 'class-validator';

export class MoveSubtaskDto {
  @IsUUID()
  columnId!: string;

  @IsDateString()
  expectedUpdatedAt!: string;
}
