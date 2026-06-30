/**
 * Anthropic Claude Provider
 * Skeleton — implementasi akan diisi saat API key tersedia.
 *
 * Dependency yang perlu diinstall:
 *   pnpm add @anthropic-ai/sdk
 */
import { LlmProvider } from './llm-provider.interface';

export class AnthropicProvider implements LlmProvider {
  // TODO: Inject ConfigService untuk mengambil ANTHROPIC_API_KEY dari .env

  async analyze(configJson: string): Promise<string> {
    // TODO: Implementasi menggunakan Anthropic SDK
    // Contoh:
    // const anthropic = new Anthropic({ apiKey: this.configService.get('ANTHROPIC_API_KEY') });
    // const response = await anthropic.messages.create({
    //   model: 'claude-opus-4-5',
    //   max_tokens: 2048,
    //   messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${configJson}` }],
    // });
    // return response.content[0].text;

    throw new Error(
      'Anthropic provider belum diimplementasikan. Isi ANTHROPIC_API_KEY di .env',
    );
  }
}
