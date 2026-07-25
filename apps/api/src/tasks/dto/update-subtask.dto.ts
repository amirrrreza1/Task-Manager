import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EstimateDto } from '../../common/dto/estimate.dto';

export class UpdateSubtaskDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(50_000) description?: string | null;
  @IsOptional() @IsUUID() assigneeId?: string | null;
  @IsOptional() @IsBoolean() isCompleted?: boolean;
  @IsOptional() @ValidateNested() @Type(() => EstimateDto) estimate?: EstimateDto | null;
}
