import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class BackupDownloadQueryDto {
  @ApiPropertyOptional({
    default: true,
    description: 'Whether to include uploaded attachments in the archive',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === '1')
  @IsBoolean()
  includeAttachments?: boolean = true;

  @ApiPropertyOptional({ enum: ['zip', 'json'], default: 'zip', description: 'Backup file format' })
  @IsOptional()
  @IsIn(['zip', 'json'])
  format?: 'zip' | 'json' = 'zip';
}

export class BackupTelegramDto {
  @ApiPropertyOptional({ default: true, description: 'Whether to include uploaded attachments' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === '1')
  @IsBoolean()
  includeAttachments?: boolean = true;
}
