import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateProfileDto {
  @ApiProperty({
    description: 'ID server MikroTik tempat profil dibuat',
    example: 'cmpnoc2ea0000o0ustysa8zf5',
  })
  @IsString({ message: 'serverId harus berupa string' })
  @IsNotEmpty({ message: 'serverId tidak boleh kosong' })
  serverId!: string;

  @ApiProperty({
    description:
      'Nama profile di MikroTik (tidak boleh spasi, gunakan underscore)',
    example: 'Paket_1_Jam',
  })
  @IsString({ message: 'Nama harus berupa string' })
  @IsNotEmpty({ message: 'Nama tidak boleh kosong' })
  name!: string;

  @ApiProperty({
    description: 'Batas kecepatan bandwidth (uplink/downlink)',
    example: '2M/2M',
  })
  @IsString({ message: 'rateLimit harus berupa string' })
  @IsNotEmpty({ message: 'rateLimit tidak boleh kosong' })
  rateLimit!: string;

  @ApiProperty({
    description: 'Batas durasi koneksi per sesi user (misal: 1h, 8h, 1d)',
    example: '1h',
    required: false,
  })
  @IsString({ message: 'sessionTimeout harus berupa string' })
  @IsOptional()
  sessionTimeout?: string;

  @ApiProperty({
    description:
      'Durasi logout otomatis jika user tidak aktif (misal: 10m, 30m)',
    example: '10m',
    required: false,
  })
  @IsString({ message: 'idleTimeout harus berupa string' })
  @IsOptional()
  idleTimeout?: string;

  @ApiProperty({
    description:
      'Jumlah device maksimal yang bisa login bersamaan dengan 1 voucher',
    example: 1,
    default: 1,
  })
  @IsInt({ message: 'sharedUsers harus berupa angka' })
  @Min(1, { message: 'sharedUsers minimal 1' })
  sharedUsers: number = 1;

  @ApiProperty({
    description: 'Durasi aktif voucher setelah login pertama (misal: 1d, 7d)',
    example: '1d',
    required: false,
  })
  @IsString({ message: 'validity harus berupa string' })
  @IsOptional()
  validity?: string;

  @ApiProperty({
    description: 'Keterangan deskriptif profil paket WiFi',
    example: 'Voucher 1 Jam Wifi Kafe',
    required: false,
  })
  @IsString({ message: 'Deskripsi harus berupa string' })
  @IsOptional()
  description?: string;
}
