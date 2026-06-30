import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsEmail({}, { message: 'Email tidak valid' })
  email!: string;

  @IsString({ message: 'Password harus berupa teks' })
  @MinLength(6, { message: 'Password minimal 6 karakter' })
  password!: string;

  @IsString({ message: 'Nama harus berupa teks' })
  @IsNotEmpty({ message: 'Nama wajib diisi' })
  name!: string;

  /**
   * Hanya dipakai SUPER_ADMIN (OWNER | TEKNISI). Diabaikan untuk OWNER
   * (selalu dipaksa TEKNISI). Tidak boleh SUPER_ADMIN via API.
   */
  @IsOptional()
  @IsEnum(Role, { message: 'Role harus OWNER atau TEKNISI' })
  role?: Role;

  /**
   * Wajib bila SUPER_ADMIN membuat TEKNISI (menunjuk Owner). Untuk OWNER
   * pembuat, diabaikan (ownerId otomatis = id Owner).
   */
  @IsOptional()
  @IsString()
  ownerId?: string;
}
