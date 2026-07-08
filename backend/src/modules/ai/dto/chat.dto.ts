import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Provider LLM yang didukung untuk AI chat. */
export const AI_CHAT_PROVIDERS = [
  'gemini',
  'openrouter',
  'openai',
  'anthropic',
] as const;

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

  /**
   * Provider LLM yang dipakai (opsional). Bila kosong → ikut env `LLM_PROVIDER`
   * (default `gemini`). Pilihan: gemini | openrouter | openai | anthropic.
   */
  @IsOptional()
  @IsIn(AI_CHAT_PROVIDERS, {
    message: `Provider harus salah satu dari: ${AI_CHAT_PROVIDERS.join(', ')}`,
  })
  provider?: (typeof AI_CHAT_PROVIDERS)[number];
}
