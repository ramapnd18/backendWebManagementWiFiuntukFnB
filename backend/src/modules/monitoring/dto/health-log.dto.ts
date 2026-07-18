import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

/** Query histori healthcheck router (log penuh, ter-scope per Owner). */
export class HealthLogDto {
  @ApiPropertyOptional({ description: 'Filter untuk satu server (outlet)' })
  @IsOptional()
  @IsString({ message: 'serverId harus berupa string' })
  serverId?: string;

  @ApiPropertyOptional({ description: 'Tanggal mulai (ISO-8601)' })
  @IsOptional()
  @IsISO8601({}, { message: 'from harus tanggal ISO-8601' })
  from?: string;

  @ApiPropertyOptional({ description: 'Tanggal akhir (ISO-8601)' })
  @IsOptional()
  @IsISO8601({}, { message: 'to harus tanggal ISO-8601' })
  to?: string;

  @ApiPropertyOptional({ description: 'Offset pagination', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'skip harus berupa angka' })
  @Min(0, { message: 'skip minimal 0' })
  skip?: number;

  @ApiPropertyOptional({ description: 'Jumlah data per halaman', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'take harus berupa angka' })
  @Min(1, { message: 'take minimal 1' })
  @Max(500, { message: 'take maksimal 500' })
  take?: number;
}

/** Query agregat uptime per hari. */
export class HealthSummaryDto {
  @ApiPropertyOptional({ description: 'Filter untuk satu server (outlet)' })
  @IsOptional()
  @IsString({ message: 'serverId harus berupa string' })
  serverId?: string;

  @ApiPropertyOptional({ description: 'Jumlah hari ke belakang', default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'days harus berupa angka' })
  @Min(1, { message: 'days minimal 1' })
  @Max(365, { message: 'days maksimal 365' })
  days?: number;
}
