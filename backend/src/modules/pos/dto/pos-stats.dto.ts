import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';

/**
 * Query agregat transaksi POS untuk chart. Default rentang 30 hari terakhir.
 */
export class PosStatsDto {
  @ApiPropertyOptional({
    description: 'Granularitas bucket (saat ini hanya "day")',
    default: 'day',
    enum: ['day'],
  })
  @IsOptional()
  @IsIn(['day'], { message: 'groupBy hanya mendukung "day"' })
  groupBy?: 'day';

  @ApiPropertyOptional({ description: 'Tanggal mulai (ISO-8601)' })
  @IsOptional()
  @IsISO8601({}, { message: 'from harus tanggal ISO-8601' })
  from?: string;

  @ApiPropertyOptional({ description: 'Tanggal akhir (ISO-8601)' })
  @IsOptional()
  @IsISO8601({}, { message: 'to harus tanggal ISO-8601' })
  to?: string;

  @ApiPropertyOptional({ description: 'Filter untuk satu server (outlet)' })
  @IsOptional()
  serverId?: string;
}
