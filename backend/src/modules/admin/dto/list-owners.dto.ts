import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Query daftar Owner + agregat (panel SUPER_ADMIN). */
export class ListOwnersDto {
  @ApiPropertyOptional({ description: 'Offset pagination', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'skip harus berupa angka' })
  @Min(0, { message: 'skip minimal 0' })
  skip?: number;

  @ApiPropertyOptional({ description: 'Jumlah data per halaman', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'take harus berupa angka' })
  @Min(1, { message: 'take minimal 1' })
  take?: number;

  @ApiPropertyOptional({ description: 'Cari di nama / email' })
  @IsOptional()
  @IsString({ message: 'search harus berupa string' })
  search?: string;

  @ApiPropertyOptional({ description: 'Filter kode paket langganan aktif' })
  @IsOptional()
  @IsString({ message: 'planCode harus berupa string' })
  planCode?: string;
}
