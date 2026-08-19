import { Transform } from 'class-transformer';
import {
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';
import { BOARD_COLUMN_COLORS } from '../column-colors';

export class CreateColumnDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined,
  )
  @ValidateIf((o) => typeof o.workspaceId === 'string' && o.workspaceId.length > 0)
  @IsUuidLike()
  workspaceId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsHexColor()
  @IsIn(BOARD_COLUMN_COLORS)
  color!: string;
}
