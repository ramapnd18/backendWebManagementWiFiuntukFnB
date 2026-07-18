import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/** Query pagination riwayat invoice owner. */
export class ListInvoicesDto {
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
}
