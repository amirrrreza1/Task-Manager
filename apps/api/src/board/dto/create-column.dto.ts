import { IsBoolean, IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateColumnDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsHexColor()
  color!: string;

  @IsOptional()
  @IsBoolean()
  isDone?: boolean;
}
