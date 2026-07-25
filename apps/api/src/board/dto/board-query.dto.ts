import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) => value === 'true' || value === true;

export class BoardQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  search?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  sprintId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unassigned?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasEstimate?: boolean;
}
