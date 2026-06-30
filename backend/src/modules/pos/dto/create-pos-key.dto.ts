import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Body untuk membuat API key POS baru (admin).
 * Lihat doc/POS_INTEGRATION.md §2.
 */
export class CreatePosKeyDto {
  @ApiProperty({
    description: 'Label / nama outlet untuk identifikasi API key.',
    example: 'Outlet A',
  })
  @IsString({ message: 'Label harus berupa string' })
  @IsNotEmpty({ message: 'Label tidak boleh kosong' })
  label!: string;

  @ApiProperty({
    description:
      'ID server MikroTik yang diikat ke API key ini. Key hanya bisa mengakses server ini.',
    example: 'cmqa8lvx40009z8us9542d23p',
  })
  @IsString({ message: 'serverId harus berupa string' })
  @IsNotEmpty({ message: 'serverId tidak boleh kosong' })
  serverId!: string;
}
