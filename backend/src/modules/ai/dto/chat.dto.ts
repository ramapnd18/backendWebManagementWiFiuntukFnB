import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChatDto {
  @IsString({ message: 'Pertanyaan harus berupa teks' })
  @IsNotEmpty({ message: 'Pertanyaan wajib diisi' })
  @MaxLength(2000, { message: 'Pertanyaan terlalu panjang (maks 2000 karakter)' })
  question!: string;

  /** Konteks router (opsional). Bila diisi → konteks + config live difokuskan ke router ini. */
  @IsOptional()
  @IsString()
  serverId?: string;

  /** Lanjutkan percakapan (opsional). Bila kosong → buat sesi baru. */
  @IsOptional()
  @IsString()
  sessionId?: string;
}
