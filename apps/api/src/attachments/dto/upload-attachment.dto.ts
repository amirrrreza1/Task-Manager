import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadAttachmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  comment?: string;
}
