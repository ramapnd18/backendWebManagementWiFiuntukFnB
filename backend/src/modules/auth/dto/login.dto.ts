import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Email address of the admin',
    example: 'admin@wifimanagement.local',
  })
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email tidak boleh kosong' })
  email!: string;

  @ApiProperty({
    description: 'Password of the admin account',
    example: 'admin123',
  })
  @IsString({ message: 'Password harus berupa string' })
  @MinLength(6, { message: 'Password minimal terdiri dari 6 karakter' })
  @IsNotEmpty({ message: 'Password tidak boleh kosong' })
  password!: string;
}
