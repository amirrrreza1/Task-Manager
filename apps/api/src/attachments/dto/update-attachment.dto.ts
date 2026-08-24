import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAttachmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  comment?: string | null;
}
