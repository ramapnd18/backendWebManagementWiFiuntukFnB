import { ApiPropertyOptional } from '@nestjs/swagger';
import { PosTxStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Query untuk riwayat transaksi POS (panel admin, ter-scope per Owner).
 */
export class ListPosTransactionsDto {
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
  take?: number;

  @ApiPropertyOptional({ description: 'Filter untuk satu server (outlet)' })
  @IsOptional()
  @IsString({ message: 'serverId harus berupa string' })
  serverId?: string;

  @ApiPropertyOptional({ enum: PosTxStatus, description: 'Filter status transaksi' })
  @IsOptional()
  @IsEnum(PosTxStatus, { message: 'status tidak valid' })
  status?: PosTxStatus;

  @ApiPropertyOptional({
    description: 'Cari di outletName / customerName / transactionId',
  })
  @IsOptional()
  @IsString({ message: 'search harus berupa string' })
  search?: string;
}
