import { IsHexColor, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { BOARD_COLUMN_COLORS } from '../column-colors';

export class CreateColumnDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsHexColor()
  @IsIn(BOARD_COLUMN_COLORS)
  color!: string;
}
