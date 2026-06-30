import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Body request dari sistem POS untuk memicu pembuatan 1 voucher.
 * Lihat doc/POS_INTEGRATION.md §4.
 */
export class TriggerVoucherDto {
  @ApiProperty({
    description:
      'ID transaksi unik dari sistem POS. Dipakai sebagai kunci idempotensi (cegah voucher dobel).',
    example: 'TRX-POS-2026-001',
  })
  @IsString({ message: 'transactionId harus berupa string' })
  @IsNotEmpty({ message: 'transactionId tidak boleh kosong' })
  transactionId!: string;

  @ApiProperty({
    description:
      'ID router MikroTik target (OPSIONAL). Server sudah ditentukan oleh API key; ' +
      'bila diisi, harus sama dengan server milik key (jika beda → 403).',
    example: 'cmq1abc...',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'serverId harus berupa string' })
  serverId?: string;

  @ApiProperty({
    description: 'ID paket / profile hotspot yang dipilih kasir.',
    example: 'cmp1xyz...',
  })
  @IsString({ message: 'profileId harus berupa string' })
  @IsNotEmpty({ message: 'profileId tidak boleh kosong' })
  profileId!: string;

  @ApiProperty({
    description: 'Nama outlet (opsional, tampil di struk).',
    example: 'Outlet A',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'outletName harus berupa string' })
  outletName?: string;

  @ApiProperty({
    description: 'Nama pelanggan (opsional).',
    example: 'Budi',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'customerName harus berupa string' })
  customerName?: string;
}
