import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateSprintDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  goal?: string | null;
}
