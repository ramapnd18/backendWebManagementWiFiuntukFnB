import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * Body untuk mengaktifkan / menonaktifkan API key POS (admin).
 */
export class UpdatePosKeyDto {
  @ApiProperty({
    description:
      'Status aktif API key. false = nonaktifkan (revoke sementara).',
    example: false,
  })
  @IsBoolean({ message: 'isActive harus berupa boolean' })
  isActive!: boolean;
}
