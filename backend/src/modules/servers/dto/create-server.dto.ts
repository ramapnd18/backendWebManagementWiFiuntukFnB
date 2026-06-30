import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateServerDto {
  @ApiProperty({
    description: 'Nama server router MikroTik',
    example: 'Kafe Utama CHR',
  })
  @IsString({ message: 'Nama harus berupa string' })
  @IsNotEmpty({ message: 'Nama tidak boleh kosong' })
  name!: string;

  @ApiProperty({
    description: 'IP Address atau domain router',
    example: '10.168.26.96',
  })
  @IsString({ message: 'Host harus berupa string' })
  @IsNotEmpty({ message: 'Host tidak boleh kosong' })
  host!: string;

  @ApiProperty({
    description: 'Port RouterOS API (default: 8728 untuk api, 8729 untuk api-ssl)',
    example: 8728,
    required: false,
  })
  @IsInt({ message: 'Port harus berupa angka' })
  @Min(1)
  @Max(65535)
  @IsOptional()
  port?: number;

  @ApiProperty({
    description: 'Username admin router MikroTik',
    example: 'admin',
  })
  @IsString({ message: 'Username harus berupa string' })
  @IsNotEmpty({ message: 'Username tidak boleh kosong' })
  username!: string;

  @ApiProperty({
    description: 'Password admin router MikroTik',
    example: 'admin',
  })
  @IsString({ message: 'Password harus berupa string' })
  @IsNotEmpty({ message: 'Password tidak boleh kosong' })
  password!: string;

  @ApiProperty({
    description: 'Gunakan SSL (HTTPS) untuk koneksi REST API',
    example: false,
    required: false,
    default: false,
  })
  @IsBoolean({ message: 'useSSL harus berupa boolean' })
  @IsOptional()
  useSSL?: boolean;

  @ApiProperty({
    description: 'Nama server hotspot di MikroTik (lihat di IP > Hotspot > Servers > Name)',
    example: 'hotspot1',
    required: false,
  })
  @IsString({ message: 'hotspotName harus berupa string' })
  @IsOptional()
  hotspotName?: string;

  @ApiProperty({
    description: 'DNS Name login page captive portal hotspot (misal: hotspot.wifi.com)',
    example: 'hotspot.wifi.com',
    required: false,
  })
  @IsString({ message: 'dnsName harus berupa string' })
  @IsOptional()
  dnsName?: string;
}
