import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Body login Google. Frontend mengirim ID token hasil Google Sign-In;
 * backend memverifikasinya via google-auth-library. Lihat doc/api/rbac.md §Login Google.
 */
export class GoogleLoginDto {
  @ApiProperty({
    description: 'ID token dari Google Sign-In (JWT yang dikeluarkan Google)',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...',
  })
  @IsString({ message: 'idToken harus berupa string' })
  @IsNotEmpty({ message: 'idToken tidak boleh kosong' })
  idToken!: string;
}
