import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * Body registrasi mandiri untuk pemilik bisnis (role dipaksa OWNER di service).
 * Lihat doc/api/rbac.md §Registrasi.
 */
export class RegisterDto {
  @ApiProperty({
    description: 'Email pemilik (harus unik)',
    example: 'owner@contoh.com',
  })
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email tidak boleh kosong' })
  email!: string;

  @ApiProperty({
    description: 'Password akun (minimal 6 karakter)',
    example: 'rahasia123',
  })
  @IsString({ message: 'Password harus berupa string' })
  @MinLength(6, { message: 'Password minimal terdiri dari 6 karakter' })
  @IsNotEmpty({ message: 'Password tidak boleh kosong' })
  password!: string;

  @ApiProperty({ description: 'Nama pemilik / bisnis', example: 'Kafe Kopi Senja' })
  @IsString({ message: 'Nama harus berupa string' })
  @IsNotEmpty({ message: 'Nama tidak boleh kosong' })
  name!: string;
}
