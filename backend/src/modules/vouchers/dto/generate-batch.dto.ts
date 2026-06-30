import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum CharFormat {
  UPPERCASE = 'UPPERCASE',         // Huruf besar semua (A-Z)
  LOWERCASE = 'LOWERCASE',         // Huruf kecil semua (a-z)
  MIXED_CASE = 'MIXED_CASE',       // Huruf besar + kecil campur
  LETTERS_ONLY = 'LETTERS_ONLY',   // Huruf saja (tidak ada angka)
  NUMBERS_ONLY = 'NUMBERS_ONLY',   // Angka saja
  ALPHANUMERIC = 'ALPHANUMERIC',   // Huruf + Angka campuran (default)
}

export class GenerateBatchDto {
  @ApiProperty({
    description: 'ID server MikroTik target',
    example: 'cmpnoc2ea0000o0ustysa8zf5',
  })
  @IsString({ message: 'serverId harus berupa string' })
  @IsNotEmpty({ message: 'serverId tidak boleh kosong' })
  serverId!: string;

  @ApiProperty({
    description: 'ID profile hotspot yang akan digunakan',
    example: 'cmpnod1ea0000o0ustysa8zf6',
  })
  @IsString({ message: 'profileId harus berupa string' })
  @IsNotEmpty({ message: 'profileId tidak boleh kosong' })
  profileId!: string;

  @ApiProperty({
    description: 'Jumlah voucher yang ingin dibuat secara massal (batch)',
    example: 50,
  })
  @IsInt({ message: 'count harus berupa angka' })
  @Min(1, { message: 'Jumlah minimal 1 voucher' })
  @Max(200, { message: 'Jumlah maksimal 200 voucher per batch' })
  count!: number;

  @ApiProperty({
    description: 'Prefix untuk username voucher (misal: KAFE-)',
    example: 'KAFE-',
    required: false,
  })
  @IsString({ message: 'usernamePrefix harus berupa string' })
  @IsOptional()
  usernamePrefix?: string;

  @ApiProperty({
    description: 'Panjang karakter acak pada username (default: 6)',
    example: 6,
    required: false,
    default: 6,
  })
  @IsInt({ message: 'charLength harus berupa angka' })
  @Min(4)
  @Max(10)
  @IsOptional()
  charLength?: number;

  @ApiProperty({
    description:
      'Format karakter kode voucher: UPPERCASE, LOWERCASE, MIXED_CASE, LETTERS_ONLY, NUMBERS_ONLY, ALPHANUMERIC',
    enum: CharFormat,
    example: CharFormat.UPPERCASE,
    required: false,
    default: CharFormat.UPPERCASE,
  })
  @IsEnum(CharFormat, { message: 'charFormat tidak valid' })
  @IsOptional()
  charFormat?: CharFormat;

  @ApiProperty({
    description: 'Nama outlet tempat voucher dicetak',
    example: 'Kafe Utama Jakarta',
    required: false,
  })
  @IsString({ message: 'outletName harus berupa string' })
  @IsOptional()
  outletName?: string;
}
