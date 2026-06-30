/**
 * Google Gemini Provider
 * Skeleton — implementasi akan diisi saat API key tersedia.
 *
 * Dependency yang perlu diinstall:
 *   pnpm add @google/genai
 */
import { LlmProvider } from './llm-provider.interface';

export class GeminiProvider implements LlmProvider {
  // TODO: Inject ConfigService untuk mengambil GEMINI_API_KEY dari .env

  async analyze(configJson: string): Promise<string> {
    // TODO: Implementasi menggunakan Google Gemini SDK
    // Contoh:
    // const genAI = new GoogleGenAI({ apiKey: this.configService.get('GEMINI_API_KEY') });
    // const response = await genAI.models.generateContent({
    //   model: 'gemini-2.5-pro',
    //   contents: `${SYSTEM_PROMPT}\n\n${configJson}`,
    // });
    // return response.text;

    throw new Error(
      'Gemini provider belum diimplementasikan. Isi GEMINI_API_KEY di .env',
    );
  }
}
