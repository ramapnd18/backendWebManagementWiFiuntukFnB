import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class GenerateSingleDto {
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
    description: 'Nama outlet tempat voucher dicetak',
    example: 'Kafe Utama Jakarta',
    required: false,
  })
  @IsString({ message: 'outletName harus berupa string' })
  @IsOptional()
  outletName?: string;

  @ApiProperty({
    description:
      'Username voucher (jika kosong, sistem akan meng-generate otomatis 6 digit random)',
    example: 'USER12',
    required: false,
  })
  @IsString({ message: 'username harus berupa string' })
  @Length(4, 12, {
    message: 'username minimal 4 karakter dan maksimal 12 karakter',
  })
  @IsOptional()
  username?: string;

  @ApiProperty({
    description: 'Password voucher (jika kosong, disamakan dengan username)',
    example: 'PASS34',
    required: false,
  })
  @IsString({ message: 'password harus berupa string' })
  @IsOptional()
  password?: string;
}
