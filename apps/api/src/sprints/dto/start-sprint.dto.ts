import { IsISO8601, IsOptional } from 'class-validator';

export class StartSprintDto {
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}
