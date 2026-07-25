import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EstimateDto } from '../../common/dto/estimate.dto';

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  description?: string | null;

  @IsUUID()
  columnId!: string;

  @IsOptional()
  @IsUUID()
  sprintId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => EstimateDto)
  estimate?: EstimateDto | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  assigneeIds?: string[];
}
