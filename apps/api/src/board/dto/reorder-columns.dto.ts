import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ReorderColumnsDto {
  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('4', { each: true })
  columnIds!: string[];
}
