import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePlanDto {
  @ApiProperty({ example: 'STANDARD', description: 'Kode unik & stabil (huruf besar)' })
  @IsString({ message: 'Kode harus berupa teks' })
  @IsNotEmpty({ message: 'Kode tidak boleh kosong' })
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Kode hanya boleh huruf besar, angka, dan garis bawah',
  })
  code!: string;

  @ApiProperty({ example: 'Standar', description: 'Nama tampilan paket' })
  @IsString({ message: 'Nama harus berupa teks' })
  @IsNotEmpty({ message: 'Nama tidak boleh kosong' })
  name!: string;

  @ApiProperty({ example: 150000, description: 'Harga (Rupiah), 0 = gratis' })
  @IsInt({ message: 'Harga harus berupa angka bulat' })
  @Min(0, { message: 'Harga tidak boleh negatif' })
  price!: number;

  @ApiProperty({
    example: 30,
    required: false,
    nullable: true,
    description: 'Masa berlaku (hari); null = tanpa kadaluarsa',
  })
  @IsOptional()
  @IsInt({ message: 'Durasi harus berupa angka bulat' })
  @Min(1, { message: 'Durasi minimal 1 hari' })
  durationDays?: number | null;

  @ApiProperty({ example: 5, description: 'Batas jumlah router' })
  @IsInt({ message: 'Batas router harus berupa angka bulat' })
  @Min(0, { message: 'Batas router tidak boleh negatif' })
  maxRouters!: number;

  @ApiProperty({ example: 3, description: 'Batas jumlah teknisi' })
  @IsInt({ message: 'Batas teknisi harus berupa angka bulat' })
  @Min(0, { message: 'Batas teknisi tidak boleh negatif' })
  maxTeknisi!: number;

  @ApiProperty({ example: true, description: 'Akses fitur AI (analisis + chat)' })
  @IsBoolean({ message: 'aiAccess harus boolean' })
  aiAccess!: boolean;

  @ApiProperty({ example: true, description: 'Boleh membuat POS API key / integrasi' })
  @IsBoolean({ message: 'apiKeyAccess harus boolean' })
  apiKeyAccess!: boolean;

  @ApiProperty({ example: true, required: false, description: 'Status aktif paket' })
  @IsOptional()
  @IsBoolean({ message: 'isActive harus boolean' })
  isActive?: boolean;
}
