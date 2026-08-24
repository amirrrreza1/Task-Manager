import {
  IsBoolean,
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BOARD_COLUMN_COLORS } from '../column-colors';

export class UpdateColumnDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsHexColor()
  @IsIn(BOARD_COLUMN_COLORS)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isReview?: boolean;
}
