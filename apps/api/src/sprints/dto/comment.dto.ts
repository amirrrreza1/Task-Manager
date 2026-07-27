import { IsString, MaxLength, MinLength } from 'class-validator';

export class CommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  body!: string;
}
