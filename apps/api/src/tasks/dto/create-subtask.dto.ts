import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EstimateDto } from '../../common/dto/estimate.dto';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class CreateSubtaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((o) => typeof o.assigneeId === 'string' && o.assigneeId.length > 0)
  @IsUuidLike()
  assigneeId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => EstimateDto)
  estimate?: EstimateDto | null;
}
