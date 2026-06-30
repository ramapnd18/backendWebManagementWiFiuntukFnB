/**
 * OpenAI Provider
 * Skeleton — implementasi akan diisi saat API key tersedia.
 *
 * Dependency yang perlu diinstall:
 *   pnpm add openai
 */
import { LlmProvider } from './llm-provider.interface';

export class OpenAiProvider implements LlmProvider {
  // TODO: Inject ConfigService untuk mengambil OPENAI_API_KEY dari .env

  async analyze(configJson: string): Promise<string> {
    // TODO: Implementasi menggunakan OpenAI SDK
    // Contoh:
    // const openai = new OpenAI({ apiKey: this.configService.get('OPENAI_API_KEY') });
    // const response = await openai.chat.completions.create({
    //   model: 'gpt-4o',
    //   messages: [
    //     { role: 'system', content: SYSTEM_PROMPT },
    //     { role: 'user', content: configJson },
    //   ],
    // });
    // return response.choices[0].message.content;

    throw new Error(
      'OpenAI provider belum diimplementasikan. Isi OPENAI_API_KEY di .env',
    );
  }
}
