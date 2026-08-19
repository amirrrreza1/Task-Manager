import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class CreateSprintDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined,
  )
  @ValidateIf((o) => typeof o.workspaceId === 'string' && o.workspaceId.length > 0)
  @IsUuidLike()
  workspaceId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  goal?: string | null;
}
