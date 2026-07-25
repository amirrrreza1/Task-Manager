import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) => value === 'true' || value === true;

export class TaskQueryDto {
  @IsOptional() @IsString() @MaxLength(240) search?: string;
  @IsOptional() @IsUUID() columnId?: string;
  @IsOptional() @IsUUID() sprintId?: string;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional() @Transform(toBoolean) @IsBoolean() unassigned?: boolean;
  @IsOptional() @Transform(toBoolean) @IsBoolean() hasEstimate?: boolean;
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}
